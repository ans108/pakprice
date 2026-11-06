import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { getDbCounts, verifyDbIntegrity, scrapeShophiveCandidates } from './staged-ingest-runner-6g';

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

async function runStep3() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6G — STEP 3: SHOPHIVE STAGED INGESTION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'shophive').single();
  if (!store) throw new Error('Store shophive not found');

  const ingestionService = new PriceIngestionService();

  const baselineCounts = await getDbCounts();
  console.log('BASELINE DATABASE COUNTS (Before Step 3):', baselineCounts);
  await verifyDbIntegrity();

  // ────────────────────────────────────────────────────────────────
  // STAGE 3A: 5 Items
  // ────────────────────────────────────────────────────────────────
  console.log('\n===================================================================');
  console.log('  STAGE 3A: BATCH OF 5 ITEMS (Initial activation & verification)');
  console.log('===================================================================');

  console.log('Harvesting 5 candidates for Stage 3A...');
  const stage3AItems = await scrapeShophiveCandidates(0, 5);
  console.log(`Harvested ${stage3AItems.length} valid priced items for Stage 3A.`);

  // 1. Dry-run
  console.log('\n[Stage 3A] Running Dry-Run...');
  const countsBeforeDry3A = await getDbCounts();
  for (const item of stage3AItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, true);
    console.log(`  Dry-run: "${item.product.name}" -> action=${res?.action}, match=${res?.matchMethod}`);
  }
  const countsAfterDry3A = await getDbCounts();
  const drySafe3A = JSON.stringify(countsBeforeDry3A) === JSON.stringify(countsAfterDry3A);
  console.log(`[Stage 3A] Dry-run zero mutation: ${drySafe3A ? '✅ PASS' : '❌ FAIL'}`);
  if (!drySafe3A) throw new Error('Dry-run mutated the database in Stage 3A!');

  // 2. Live Ingest
  console.log('\n[Stage 3A] Executing Live Ingestion...');
  for (const item of stage3AItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, false);
    console.log(`  Live: "${item.product.name}" -> action=${res?.action}, variantId=${res?.variantId}, match=${res?.matchMethod}`);
  }

  const countsAfterLive3A = await getDbCounts();
  console.log('\n[Stage 3A] Counts after Live Ingest:', countsAfterLive3A);
  console.log(`[Stage 3A] Net added: products=+${countsAfterLive3A.products - countsBeforeDry3A.products}, variants=+${countsAfterLive3A.variants - countsBeforeDry3A.variants}, prices=+${countsAfterLive3A.prices - countsBeforeDry3A.prices}, history=+${countsAfterLive3A.priceHistory - countsBeforeDry3A.priceHistory}`);
  await verifyDbIntegrity();

  // 3. Deduplication check on re-ingest
  console.log('\n[Stage 3A] Verifying 5C History Deduplication on immediate re-ingest...');
  const reingest3A = await ingestWithRetry(ingestionService, stage3AItems[0].product, store.id, false);
  const countsAfterDedup3A = await getDbCounts();
  const dedupPass3A = countsAfterDedup3A.priceHistory === countsAfterLive3A.priceHistory;
  console.log(`[Stage 3A] Deduplication verified (0 new history rows): ${dedupPass3A ? '✅ PASS' : '❌ FAIL'} (dedup flag: ${reingest3A?.historyDeduplicated})`);
  if (!dedupPass3A) throw new Error('Stage 3A deduplication failed!');

  // ────────────────────────────────────────────────────────────────
  // STAGE 3B: 15 Items
  // ────────────────────────────────────────────────────────────────
  console.log('\n===================================================================');
  console.log('  STAGE 3B: BATCH OF 15 ITEMS (Mobiles & Smartwatches)');
  console.log('===================================================================');

  console.log('Harvesting 15 candidates for Stage 3B (Index 5..25)...');
  const stage3BItems = await scrapeShophiveCandidates(5, 15);
  console.log(`Harvested ${stage3BItems.length} valid priced items for Stage 3B.`);

  // 1. Dry-run
  console.log('\n[Stage 3B] Running Dry-Run...');
  const countsBeforeDry3B = await getDbCounts();
  for (const item of stage3BItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, true);
    console.log(`  Dry-run: "${item.product.name}" -> action=${res?.action}, match=${res?.matchMethod}`);
  }
  const countsAfterDry3B = await getDbCounts();
  const drySafe3B = JSON.stringify(countsBeforeDry3B) === JSON.stringify(countsAfterDry3B);
  console.log(`[Stage 3B] Dry-run zero mutation: ${drySafe3B ? '✅ PASS' : '❌ FAIL'}`);
  if (!drySafe3B) throw new Error('Dry-run mutated the database in Stage 3B!');

  // 2. Live Ingest
  console.log('\n[Stage 3B] Executing Live Ingestion...');
  for (const item of stage3BItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, false);
    console.log(`  Live: "${item.product.name}" -> action=${res?.action}, variantId=${res?.variantId}, match=${res?.matchMethod}`);
  }

  const countsAfterLive3B = await getDbCounts();
  console.log('\n[Stage 3B] Counts after Live Ingest:', countsAfterLive3B);
  await verifyDbIntegrity();

  // ────────────────────────────────────────────────────────────────
  // STAGE 3C: 20 Items
  // ────────────────────────────────────────────────────────────────
  console.log('\n===================================================================');
  console.log('  STAGE 3C: BATCH OF 20 ITEMS (Smartwatches & Flagships)');
  console.log('===================================================================');

  console.log('Harvesting 20 candidates for Stage 3C (Index 25..55)...');
  const stage3CItems = await scrapeShophiveCandidates(25, 20);
  console.log(`Harvested ${stage3CItems.length} valid priced items for Stage 3C.`);

  // 1. Dry-run
  console.log('\n[Stage 3C] Running Dry-Run...');
  const countsBeforeDry3C = await getDbCounts();
  for (const item of stage3CItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, true);
    console.log(`  Dry-run: "${item.product.name}" -> action=${res?.action}, match=${res?.matchMethod}`);
  }
  const countsAfterDry3C = await getDbCounts();
  const drySafe3C = JSON.stringify(countsBeforeDry3C) === JSON.stringify(countsAfterDry3C);
  console.log(`[Stage 3C] Dry-run zero mutation: ${drySafe3C ? '✅ PASS' : '❌ FAIL'}`);
  if (!drySafe3C) throw new Error('Dry-run mutated the database in Stage 3C!');

  // 2. Live Ingest
  console.log('\n[Stage 3C] Executing Live Ingestion...');
  for (const item of stage3CItems) {
    const res = await ingestWithRetry(ingestionService, item.product, store.id, false);
    console.log(`  Live: "${item.product.name}" -> action=${res?.action}, variantId=${res?.variantId}, match=${res?.matchMethod}`);
  }

  const finalCounts = await getDbCounts();
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 3 COMPLETE: FINAL COUNTS AFTER SHOPHIVE INGESTION');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('Final DB Counts:', finalCounts);
  console.log(`Total Added in Step 3: products=+${finalCounts.products - baselineCounts.products}, variants=+${finalCounts.variants - baselineCounts.variants}, prices=+${finalCounts.prices - baselineCounts.prices}, history=+${finalCounts.priceHistory - baselineCounts.priceHistory}, identifiers=+${finalCounts.identifiers - baselineCounts.identifiers}`);
  await verifyDbIntegrity();
}

runStep3().catch(console.error);
