import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { PaklapScraper } from '../apps/scraper/src/scrapers/stores/PaklapScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('\n=============================================================');
  console.log('  PAKLAP LIVE SCRAPER EXECUTION AUDIT: paklapScraper.scrape()');
  console.log('=============================================================\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'paklap').single();
  if (!store) throw new Error('Paklap store not found in DB');

  const paklapScraper = new PaklapScraper();
  const ingestionService = new PriceIngestionService();

  console.log('Executing live paklapScraper.scrape()...');
  const startTime = Date.now();
  const products = await paklapScraper.scrape();
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nPaklap scrape finished in ${durationSec}s. Extracted ${products.length} products.\n`);

  let persistedCount = 0;
  let laptopsCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    console.log(`[${i + 1}/${products.length}] Pipeline execution for: ${p.name}`);
    console.log(`  Discovery URL: ${p.sourceUrl}`);
    console.log(`  Identifier: ${p.sourceIdentifier} (${p.sourceIdentifierType})`);
    console.log(`  Price: PKR ${p.price}`);
    console.log(`  Image: ${p.imageUrl}`);
    console.log(`  RAM: ${p.ramGb}GB | Storage: ${p.storageGb}GB`);

    try {
      const res = await ingestionService.ingest(p, store.id, false);
      console.log(`  Matcher & Validator Result: action=${res.action}, matchMethod=${res.matchMethod || 'none'}, variantId=${res.variantId || 'new'}`);
      if (res.action === 'created' || res.action === 'updated') {
        persistedCount++;
        laptopsCount++;
      }
    } catch (e: any) {
      console.error(`  ❌ Ingestion failed for ${p.name}:`, e.message);
    }
  }

  console.log('\n=============================================================');
  console.log(`Paklap Audit Summary: Discovered=${products.length}, Persisted=${persistedCount}, Laptops=${laptopsCount}`);
  console.log('=============================================================');
}

main().catch(err => {
  console.error('Fatal Paklap error:', err);
  process.exit(1);
});
