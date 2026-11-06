import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { getDbCounts, verifyDbIntegrity, scrapeMegaCandidates } from './staged-ingest-runner-6g';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function ingestWithRetry(ingestionService: PriceIngestionService, product: any, storeId: string, dryRun: boolean, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ingestionService.ingest(product, storeId, dryRun);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.warn(`[Retry ${attempt}/${maxRetries}] Ingest failed for "${product.name}": ${err.message}. Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function runStage2C() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6G — STAGE 2C: MEGA.PK BATCH EXPANSION (Target ~60-70 total)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Store mega-pk not found');

  const ingestionService = new PriceIngestionService();

  const baselineCounts = await getDbCounts();
  console.log('DATABASE COUNTS (Before Stage 2C):', baselineCounts);
  await verifyDbIntegrity();

  console.log('Harvesting 35 candidates for Stage 2C (Index 25..75)...');
  const stage2CItems = await scrapeMegaCandidates(25, 35);
  console.log(`Harvested ${stage2CItems.length} valid priced items for Stage 2C.`);

  // 1. Dry-run
  console.log('\n[Stage 2C] Running Dry-Run...');
  const countsBeforeDry = await getDbCounts();
  for (const item of stage2CItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, true);
    console.log(`  Dry-run: "${item.product.name}" -> action=${res?.action}, match=${res?.matchMethod}`);
  }
  const countsAfterDry = await getDbCounts();
  const drySafe = JSON.stringify(countsBeforeDry) === JSON.stringify(countsAfterDry);
  console.log(`[Stage 2C] Dry-run zero mutation: ${drySafe ? '✅ PASS' : '❌ FAIL'}`);
  if (!drySafe) throw new Error('Dry-run mutated the database in Stage 2C!');

  // 2. Live Ingest
  console.log('\n[Stage 2C] Executing Live Ingestion...');
  for (const item of stage2CItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, false);
    console.log(`  Live: "${item.product.name}" -> action=${res?.action}, variantId=${res?.variantId}, match=${res?.matchMethod}`);
  }

  const finalCounts = await getDbCounts();
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 2 COMPLETE: FINAL COUNTS AFTER MEGA.PK EXPANSION');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('Final DB Counts:', finalCounts);
  await verifyDbIntegrity();
}

runStage2C().catch(console.error);
