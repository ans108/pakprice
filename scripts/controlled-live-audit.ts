import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { PaklapScraper } from '../apps/scraper/src/scrapers/stores/PaklapScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';
import { scraperConfig } from '../apps/scraper/src/config/scraperConfig';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function getStoreMap() {
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const map = new Map<string, string>();
  for (const s of stores || []) map.set(s.slug, s.id);
  return map;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6B: CONTROLLED LIVE INGESTION AUDIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const storeMap = await getStoreMap();
  const ingestionService = new PriceIngestionService();

  // ============================================================
  // 1. TELEMART: Collection crawling beyond 50 products
  // ============================================================
  console.log('\n--- 1. Telemart Live Collection Crawl ---');
  const telemartScraper = new TelemartScraper();
  const telemartId = storeMap.get('telemart')!;

  // Scrape Telemart collections
  const telemartProducts = await telemartScraper.scrape();
  console.log(`Telemart total products discovered: ${telemartProducts.length}`);

  const telemartUniqueIds = new Set(telemartProducts.map(p => p.sourceIdentifier));
  console.log(`Telemart unique identifiers: ${telemartUniqueIds.size}`);

  // Ingest batch to verify persistence
  let telemartPersisted = 0;
  let telemartMatched = 0;
  let telemartRejected = 0;

  for (const p of telemartProducts) {
    try {
      const res = await ingestionService.ingest(p, telemartId, false);
      if (res.action === 'created' || res.action === 'updated') telemartPersisted++;
      if (res.action === 'updated') telemartMatched++;
      if (res.action === 'rejected' || res.action === 'outlier_rejected' || res.action === 'ambiguous_rejected') telemartRejected++;
    } catch (e: any) {
      console.error(`Error ingesting ${p.name}:`, e.message);
    }
  }
  console.log(`Telemart ingestion results: Persisted/Updated=${telemartPersisted}, Matched=${telemartMatched}, Rejected=${telemartRejected}`);

  // ============================================================
  // 2. MEGAPK: Live crawl (>=1 mobile, >=1 laptop)
  // ============================================================
  console.log('\n--- 2. Mega.pk Live Scrape & Ingestion ---');
  const megaScraper = new MegaPkScraper();
  const megaId = storeMap.get('mega-pk')!;

  let megaProducts: any[] = [];
  try {
    megaProducts = await megaScraper.scrape();
    console.log(`Mega.pk products discovered: ${megaProducts.length}`);
  } catch (err: any) {
    console.error('Mega.pk scrape error:', err.message);
  }

  let megaMobilesPersisted = 0;
  let megaLaptopsPersisted = 0;
  for (const p of megaProducts) {
    try {
      const res = await ingestionService.ingest(p, megaId, false);
      console.log(`Mega product: ${p.name} | Category: ${p.categorySlug || 'unknown'} | Action: ${res.action}`);
      if (res.action === 'created' || res.action === 'updated') {
        const lower = p.name.toLowerCase();
        if (lower.includes('laptop') || lower.includes('macbook') || lower.includes('notebook') || lower.includes('ideapad')) {
          megaLaptopsPersisted++;
        } else {
          megaMobilesPersisted++;
        }
      }
    } catch (e: any) {
      console.error(`Error ingesting Mega product ${p.name}:`, e.message);
    }
  }
  console.log(`Mega.pk persisted: Mobiles=${megaMobilesPersisted}, Laptops=${megaLaptopsPersisted}`);

  // ============================================================
  // 3. PAKLAP: Live execute paklapScraper.scrape()
  // ============================================================
  console.log('\n--- 3. Paklap Live Scrape & Ingestion ---');
  const paklapScraper = new PaklapScraper();
  const paklapId = storeMap.get('paklap')!;

  let paklapProducts: any[] = [];
  try {
    paklapProducts = await paklapScraper.scrape();
    console.log(`Paklap products discovered: ${paklapProducts.length}`);
  } catch (err: any) {
    console.error('Paklap scrape error:', err.message);
  }

  let paklapPersisted = 0;
  for (const p of paklapProducts) {
    try {
      const res = await ingestionService.ingest(p, paklapId, false);
      console.log(`Paklap product: ${p.name} | Price: ${p.price} | Action: ${res.action}`);
      if (res.action === 'created' || res.action === 'updated') {
        paklapPersisted++;
      }
    } catch (e: any) {
      console.error(`Error ingesting Paklap product ${p.name}:`, e.message);
    }
  }
  console.log(`Paklap persisted products: ${paklapPersisted}`);

  // ============================================================
  // 4. DARAZ: Live access & anti-bot check
  // ============================================================
  console.log('\n--- 4. Daraz Live Access Check ---');
  const darazScraper = new DarazScraper();
  const darazId = storeMap.get('daraz')!;

  let darazProducts: any[] = [];
  let darazBlocked = false;
  let darazBlockReason = '';

  try {
    darazProducts = await darazScraper.scrape();
    console.log(`Daraz products discovered: ${darazProducts.length}`);
  } catch (err: any) {
    darazBlocked = true;
    darazBlockReason = err.message;
    console.warn(`Daraz scrape caught block/error: ${err.message}`);
  }

  let darazPersisted = 0;
  for (const p of darazProducts) {
    try {
      const res = await ingestionService.ingest(p, darazId, false);
      if (res.action === 'created' || res.action === 'updated') {
        darazPersisted++;
      }
    } catch (e: any) {
      console.error(`Error ingesting Daraz product:`, e.message);
    }
  }
  console.log(`Daraz persisted products: ${darazPersisted}, Blocked: ${darazBlocked}`);

  console.log('\n=============================================================');
  console.log('  LIVE INGESTION SUMMARY');
  console.log('=============================================================');
  console.log(`Telemart: Discovered=${telemartProducts.length}, Unique=${telemartUniqueIds.size}, Persisted=${telemartPersisted}`);
  console.log(`Mega.pk:  Discovered=${megaProducts.length}, Mobiles=${megaMobilesPersisted}, Laptops=${megaLaptopsPersisted}`);
  console.log(`Paklap:   Discovered=${paklapProducts.length}, Persisted=${paklapPersisted}`);
  console.log(`Daraz:    Discovered=${darazProducts.length}, Persisted=${darazPersisted}, Blocked=${darazBlocked} (${darazBlockReason})`);
}

main().catch(err => {
  console.error('Fatal live audit error:', err);
  process.exit(1);
});
