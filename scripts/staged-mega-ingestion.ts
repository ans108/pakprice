import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface StageTarget {
  name: string;
  url: string;
  expectedVariantId: string;
  expectedStorePair: string;
}

const STAGE_TARGETS: StageTarget[] = [
  {
    name: 'Apple iPhone 17 Pro Max',
    url: 'https://www.mega.pk/mobiles_products/26774/Apple-iPhone-17-Pro-Max.html',
    expectedVariantId: '621cdabd-c2f6-42e5-8a20-2bd52d4b6374',
    expectedStorePair: 'priceoye ↔ mega-pk',
  },
  {
    name: 'Xiaomi Mi Smart Band 10',
    url: 'https://www.mega.pk/watches_products/26904/Xiaomi-Mi-Smart-Band-10.html',
    expectedVariantId: 'c0b3c400-7747-470d-9e4c-6ac885d2154c',
    expectedStorePair: 'telemart ↔ mega-pk',
  },
  {
    name: 'Samsung Galaxy Watch 8 40mm',
    url: 'https://www.mega.pk/watches_products/26849/Samsung-Galaxy-Watch-8-40mm.html',
    expectedVariantId: '3486efcf-79a1-408e-9e04-8d7792e72a64',
    expectedStorePair: 'telemart ↔ mega-pk',
  },
];

async function getDbCounts() {
  const [{ count: p }, { count: v }, { count: pr }, { count: ph }, { count: spi }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
  ]);
  return { products: p!, variants: v!, prices: pr!, priceHistory: ph!, identifiers: spi! };
}

async function run() {
  console.log('=== INCREMENT 6E: CONTROLLED STAGED INGESTION OF MEGA.PK ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk store not found');

  const scraper = new MegaPkScraper();
  const ingestionService = new PriceIngestionService();

  // ── STEP 1: DRY-RUN SAFETY VERIFICATION ──
  console.log('── STEP 1: DRY-RUN SAFETY VERIFICATION ──');
  const countsBeforeDry = await getDbCounts();
  console.log('DB Counts before dry-run:', countsBeforeDry);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const scrapedItems: any[] = [];
  for (const target of STAGE_TARGETS) {
    console.log(`Dry-run scrape: ${target.name} (${target.url})`);
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    const extracted = scraper.extractFromHtml(html, target.url);
    if (!extracted) throw new Error(`Failed to extract ${target.url}`);
    const validated = scraper.validateProduct(extracted);
    if (!validated) throw new Error(`Validation failed for ${target.url}`);
    scrapedItems.push({ target, product: validated });

    // Dry-run ingest
    const dryRes = await ingestionService.ingest(validated, store.id, true);
    console.log(`  Dry-run result: action=${dryRes.action}, variantId=${dryRes.variantId}, method=${dryRes.matchMethod}`);
    if (dryRes.variantId !== target.expectedVariantId) {
      throw new Error(`Variant mismatch: expected ${target.expectedVariantId}, got ${dryRes.variantId}`);
    }
  }

  const countsAfterDry = await getDbCounts();
  console.log('DB Counts after dry-run:', countsAfterDry);

  const dryRunSafe =
    countsBeforeDry.products === countsAfterDry.products &&
    countsBeforeDry.variants === countsAfterDry.variants &&
    countsBeforeDry.prices === countsAfterDry.prices &&
    countsBeforeDry.priceHistory === countsAfterDry.priceHistory &&
    countsBeforeDry.identifiers === countsAfterDry.identifiers;

  console.log(`Dry-run zero DB mutation invariant: ${dryRunSafe ? '✅ PASS' : '❌ FAIL'}\n`);
  if (!dryRunSafe) throw new Error('Dry-run mutated database!');

  // ── STEP 2: STAGE A LIVE INGESTION ──
  console.log('── STEP 2: STAGE A LIVE INGESTION ──');
  const countsBeforeLive = await getDbCounts();
  console.log('DB Counts before live ingestion:', countsBeforeLive);

  const liveResults: any[] = [];
  for (const { target, product } of scrapedItems) {
    console.log(`\nLive Ingesting: "${product.name}" (Price: PKR ${product.price})`);
    const liveRes = await ingestionService.ingest(product, store.id, false);
    console.log(`  Result: action=${liveRes.action}, variantId=${liveRes.variantId}, method=${liveRes.matchMethod}`);
    liveResults.push({ target, product, liveRes });
  }

  const countsAfterLive = await getDbCounts();
  console.log('\nDB Counts after Stage A live ingestion:', countsAfterLive);

  // Assertions for Stage A
  console.log('\n── INVARIANT VERIFICATIONS ──');
  console.log(`1. Canonical products preserved: ${countsAfterLive.products === countsBeforeLive.products ? '✅ YES' : '❌ NO'}`);
  console.log(`2. Canonical variants preserved: ${countsAfterLive.variants === countsBeforeLive.variants ? '✅ YES' : '❌ NO'}`);
  console.log(`3. Prices added: ${countsAfterLive.prices - countsBeforeLive.prices}`);
  console.log(`4. Identifiers added: ${countsAfterLive.identifiers - countsBeforeLive.identifiers}`);
  console.log(`5. History added: ${countsAfterLive.priceHistory - countsBeforeLive.priceHistory}`);

  // ── STEP 3: DUPLICATE PRICE PROTECTION CHECK ──
  console.log('\n── STEP 3: DUPLICATE CURRENT PRICE CHECK ──');
  const { data: allPrices } = await supabase.from('prices').select('id, variant_id, store_id');
  const priceSet = new Set<string>();
  let duplicatePrices = 0;
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    if (priceSet.has(key)) duplicatePrices++;
    priceSet.add(key);
  }
  console.log(`Total current price rows: ${allPrices?.length}`);
  console.log(`Unique (variant_id, store_id) pairs: ${priceSet.size}`);
  console.log(`Duplicate current prices: ${duplicatePrices} ${duplicatePrices === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // ── STEP 4: 5C DEDUPLICATION RE-INGESTION TEST ──
  console.log('\n── STEP 4: 5C HISTORY DEDUPLICATION WINDOW TEST ──');
  console.log('Re-ingesting all 3 identical products to test history deduplication within window...');
  for (const item of scrapedItems) {
    const reingestRes = await ingestionService.ingest(item.product, store.id, false);
    console.log(`Re-ingest "${item.product.name}": action=${reingestRes.action}, historyDeduplicated=${reingestRes.historyDeduplicated}`);
  }

  const countsAfterReingest = await getDbCounts();
  const historyDidNotGrow = countsAfterReingest.priceHistory === countsAfterLive.priceHistory;
  console.log(`History count unchanged on immediate repeat ingest: ${historyDidNotGrow ? '✅ PASS' : '❌ FAIL'}`);

  // ── STEP 5: MULTI-STORE VARIANT RECONCILIATION ──
  console.log('\n── STEP 5: MULTI-STORE VARIANT RECONCILIATION ──');
  const { data: storesList } = await supabase.from('stores').select('id, slug, name');
  const storeSlugMap = new Map((storesList || []).map(s => [s.id, s.slug]));

  const { data: variantsWithPrices } = await supabase.from('product_variants').select(`
    id, name,
    products ( name ),
    prices ( store_id, price )
  `);

  const multiStoreVariants: any[] = [];
  const storePairCounts: Record<string, number> = {};

  for (const v of variantsWithPrices || []) {
    const prs = v.prices || [];
    const distinctStores = Array.from(new Set(prs.map((p: any) => storeSlugMap.get(p.store_id)))).filter(Boolean);
    if (distinctStores.length >= 2) {
      multiStoreVariants.push({
        variantId: v.id,
        productName: (v.products as any)?.name,
        stores: distinctStores,
        prices: prs.map((p: any) => ({ store: storeSlugMap.get(p.store_id), price: p.price })),
      });

      // record store pairs
      for (let i = 0; i < distinctStores.length; i++) {
        for (let j = i + 1; j < distinctStores.length; j++) {
          const pairKey = [distinctStores[i], distinctStores[j]].sort().join(' ↔ ');
          storePairCounts[pairKey] = (storePairCounts[pairKey] || 0) + 1;
        }
      }
    }
  }

  console.log(`\nVerified multi-store variants count: ${multiStoreVariants.length} (Baseline: 7)`);
  console.log('Store-Pair breakdown:');
  for (const [pair, cnt] of Object.entries(storePairCounts)) {
    console.log(`  - ${pair}: ${cnt} variant(s)`);
  }

  console.log('\nAll Multi-Store Variants:');
  for (let i = 0; i < multiStoreVariants.length; i++) {
    const m = multiStoreVariants[i];
    const priceStr = m.prices.map((p: any) => `${p.store}: Rs. ${p.price}`).join(', ');
    console.log(`  ${i + 1}. "${m.productName}" [${m.stores.join(', ')}] -> ${priceStr}`);
  }

  await browser.close();
}

run().catch(console.error);
