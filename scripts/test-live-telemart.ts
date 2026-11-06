import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { STORE_CATEGORY_MAP } from '../apps/scraper/src/config/categoryMap';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('\n=============================================================');
  console.log('  TELEMART LIVE CRAWL & INGESTION (DEEP COLLECTION AUDIT)');
  console.log('=============================================================\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'telemart').single();
  if (!store) throw new Error('Telemart store not found in DB');

  const collections = STORE_CATEGORY_MAP['telemart'] || [];
  console.log(`Configured Telemart Collections: ${collections.length}`);
  for (const c of collections) {
    console.log(`  - [${c.categorySlug}] ${c.url}`);
  }

  const telemartScraper = new TelemartScraper();
  const startTime = Date.now();
  const products = await telemartScraper.scrape();
  const durationMs = Date.now() - startTime;

  console.log(`\nCrawl complete in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`Total raw products discovered: ${products.length}`);

  const uniqueByIdentifier = new Map<string, any>();
  const categoryCounts: Record<string, number> = {};

  for (const p of products) {
    uniqueByIdentifier.set(p.sourceIdentifier, p);
    const cat = p.categorySlug || 'uncategorized';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  console.log(`Unique products by identifier: ${uniqueByIdentifier.size}`);
  console.log(`Duplicate discoveries: ${products.length - uniqueByIdentifier.size}`);
  console.log(`Categorized products breakdown:`, categoryCounts);

  // Ingestion
  const ingestionService = new PriceIngestionService();
  let created = 0;
  let updated = 0;
  let rejected = 0;
  let outlierRejected = 0;
  let ambiguousRejected = 0;
  let dryRunMatched = 0;

  for (const p of uniqueByIdentifier.values()) {
    try {
      const res = await ingestionService.ingest(p, store.id, false);
      if (res.action === 'created') created++;
      else if (res.action === 'updated') updated++;
      else if (res.action === 'rejected') rejected++;
      else if (res.action === 'outlier_rejected') outlierRejected++;
      else if (res.action === 'ambiguous_rejected') ambiguousRejected++;
    } catch (e: any) {
      console.error(`Error ingesting ${p.name}:`, e.message);
      rejected++;
    }
  }

  console.log('\n--- Telemart Ingestion Results ---');
  console.log(`Created new products/variants: ${created}`);
  console.log(`Updated existing matched variants: ${updated}`);
  console.log(`Rejected (invalid price): ${rejected}`);
  console.log(`Outlier rejected: ${outlierRejected}`);
  console.log(`Ambiguous rejected: ${ambiguousRejected}`);
  console.log(`Total active persisted/updated: ${created + updated}`);
}

main().catch(err => {
  console.error('Fatal Telemart error:', err);
  process.exit(1);
});
