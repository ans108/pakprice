/**
 * Increment 6L — DISCOVERY MODE Comprehensive Verification Script
 *
 * Demonstrates that previously unknown real products from all 4 Tier-1 stores
 * (PriceOye, Telemart, Mega.pk, Shophive) legitimately enter PakPrice through
 * DISCOVERY mode (job_type='discovery', allowCreate=true), persist canonical
 * products/variants/prices/identifiers, expose them via the Offers API and
 * Product Detail API, and remain idempotent under REFRESH mode (allowCreate=false).
 *
 * Rules:
 * - NO synthetic or fabricated payloads.
 * - NO fabricated prices or URLs.
 * - NO weakened ProductMatcher thresholds.
 * - 12 real test cases (3 per Tier-1 store).
 */

import axios from 'axios';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DiscoveryTestCase {
  store: 'PriceOye' | 'Telemart' | 'Mega.pk' | 'Shophive';
  storeSlug: string;
  productName: string;
  brand: string;
  url: string;
  shopifyHandle?: string;
  expectedInitialInDb: boolean;
}

const DISCOVERY_CASES: DiscoveryTestCase[] = [
  // ── PriceOye (3 Real Products) ──
  {
    store: 'PriceOye',
    storeSlug: 'priceoye',
    productName: 'ZTE Blade A54',
    brand: 'ZTE',
    url: 'https://priceoye.pk/mobiles/zte/zte-blade-a54',
    expectedInitialInDb: false,
  },
  {
    store: 'PriceOye',
    storeSlug: 'priceoye',
    productName: 'Sparx Neo 7 Plus',
    brand: 'Sparx',
    url: 'https://priceoye.pk/mobiles/sparx/sparx-neo-7-plus',
    expectedInitialInDb: false,
  },
  {
    store: 'PriceOye',
    storeSlug: 'priceoye',
    productName: 'Tecno Spark Go 1',
    brand: 'Tecno',
    url: 'https://priceoye.pk/mobiles/tecno/tecno-spark-go-1',
    expectedInitialInDb: false,
  },

  // ── Telemart (3 Real Products) ──
  {
    store: 'Telemart',
    storeSlug: 'telemart',
    productName: 'ZTE Blade A35e Dual Sim With Official Warranty',
    brand: 'ZTE',
    url: 'https://www.telemart.pk/products/zte-blade-a35e-dual-sim-with-official-warranty',
    shopifyHandle: 'zte-blade-a35e-dual-sim-with-official-warranty',
    expectedInitialInDb: false,
  },
  {
    store: 'Telemart',
    storeSlug: 'telemart',
    productName: 'ZTE Nubia Focus Pro 5G (8GB256GB) Dual Sim With Official Warranty',
    brand: 'ZTE',
    url: 'https://www.telemart.pk/products/zte-nubia-focus-pro-5g-8gb256gb-dual-sim-with-official-warranty',
    shopifyHandle: 'zte-nubia-focus-pro-5g-8gb256gb-dual-sim-with-official-warranty',
    expectedInitialInDb: false,
  },
  {
    store: 'Telemart',
    storeSlug: 'telemart',
    productName: 'ZTE Nubia A56 Dual Sim With Official Warranty',
    brand: 'ZTE',
    url: 'https://www.telemart.pk/products/zte-nubia-a56-dual-sim-with-official-warranty',
    shopifyHandle: 'zte-nubia-a56-dual-sim-with-official-warranty',
    expectedInitialInDb: true, // Existing canonical match & offer attachment test
  },

  // ── Mega.pk (3 Real Products) ──
  {
    store: 'Mega.pk',
    storeSlug: 'mega-pk',
    productName: 'Google Pixel Watch 3 45mm',
    brand: 'Google',
    url: 'https://www.mega.pk/watches_products/26388/Google-Pixel-Watch-3-45mm.html',
    expectedInitialInDb: false,
  },
  {
    store: 'Mega.pk',
    storeSlug: 'mega-pk',
    productName: 'GOOGLE PIXEL WATCH 2',
    brand: 'Google',
    url: 'https://www.mega.pk/watches_products/25318/GOOGLE-PIXEL-WATCH-2.html',
    expectedInitialInDb: false,
  },
  {
    store: 'Mega.pk',
    storeSlug: 'mega-pk',
    productName: 'Fitbit Inspire 3',
    brand: 'Fitbit',
    url: 'https://www.mega.pk/watches_products/26899/Fitbit-Inspire-3.html',
    expectedInitialInDb: false,
  },

  // ── Shophive (3 Real Products) ──
  {
    store: 'Shophive',
    storeSlug: 'shophive',
    productName: 'Dcode Cygnal Prime 6GB 128GB',
    brand: 'Dcode',
    url: 'https://www.shophive.com/dcode-cygnal-prime-6gb-128gb/',
    expectedInitialInDb: false,
  },
  {
    store: 'Shophive',
    storeSlug: 'shophive',
    productName: 'Itel A70 4GB 128GB',
    brand: 'Itel',
    url: 'https://www.shophive.com/itel-a70-4gb-128gb/',
    expectedInitialInDb: false,
  },
  {
    store: 'Shophive',
    storeSlug: 'shophive',
    productName: 'Dcode Cygnal X 4GB 64GB',
    brand: 'Dcode',
    url: 'https://www.shophive.com/decode-cygnal-x-4-64gb/',
    expectedInitialInDb: true, // Existing canonical match & offer attachment test
  },
];

interface CaseExecutionResult {
  index: number;
  store: string;
  productName: string;
  url: string;
  preFlightInDb: boolean;
  scrapedPrice: number | null;
  scrapedStock: boolean;
  scrapedIdentifier: string | null;
  scrapedBrand: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  ingestionAction: string;
  productId: string | null;
  variantId: string | null;
  productSlug: string | null;
  dbPriceVerified: boolean;
  offersApiVerified: boolean;
  offersCount: number;
  frontendProductVerified: boolean;
  refreshAction: string;
  refreshIdempotent: boolean;
  error?: string;
}

async function run12CaseDiscoveryVerification() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6L: FINAL REAL DISCOVERY MODE VERIFICATION');
  console.log('  12 Real Products across 4 Tier-1 Stores (PriceOye, Telemart, Mega.pk, Shophive)');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // 0. Store configuration
  const { data: stores } = await supabase.from('stores').select('id, name, slug, scraper_key');
  const storeMap = new Map<string, any>();
  for (const s of stores || []) {
    if (s.slug) storeMap.set(s.slug, s);
    if (s.scraper_key) storeMap.set(s.scraper_key, s);
  }

  const priceoye = new PriceOyeScraper();
  const telemart = new TelemartScraper();
  const mega = new MegaPkScraper();
  const shophive = new ShophiveScraper();
  const matcher = new ProductMatcher();
  const ingestion = new PriceIngestionService();

  // Fetch Telemart collection cache to avoid Shopify rate limiting
  console.log('>>> [PRE] Loading Telemart Shopify collection cache for live data...');
  const tmProductCache = new Map<string, any>();
  try {
    const tmRes = await axios.get('https://www.telemart.pk/collections/smart-phones/products.json?limit=100', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    for (const p of tmRes.data.products || []) {
      tmProductCache.set(p.handle, p);
    }
    console.log(`    Loaded ${tmProductCache.size} live Telemart products from collection.\n`);
  } catch (tmErr: any) {
    console.log(`    Warning loading Telemart collection: ${tmErr.message}\n`);
  }

  // 1. Pre-flight Catalog Audit
  console.log('▓▓▓ PHASE 1: PRE-FLIGHT CATALOG AUDIT ▓▓▓');
  const executionResults: CaseExecutionResult[] = [];

  for (let i = 0; i < DISCOVERY_CASES.length; i++) {
    const tc = DISCOVERY_CASES[i];
    const { data: exactInDb } = await supabase
      .from('products')
      .select('id, name, slug')
      .ilike('name', tc.productName);

    const exists = !!(exactInDb && exactInDb.length > 0);
    console.log(`  [Case ${i + 1}/12] ${tc.store} - "${tc.productName}"`);
    console.log(`    URL: ${tc.url}`);
    console.log(`    Pre-test Catalog Presence: ${exists ? `EXISTS (ID: ${exactInDb![0].id})` : 'NOT IN DB (Fresh Discovery Target)'}`);

    executionResults.push({
      index: i + 1,
      store: tc.store,
      productName: tc.productName,
      url: tc.url,
      preFlightInDb: exists,
      scrapedPrice: null,
      scrapedStock: false,
      scrapedIdentifier: null,
      scrapedBrand: null,
      matchStatus: 'pending',
      matchConfidence: null,
      ingestionAction: 'pending',
      productId: null,
      variantId: null,
      productSlug: null,
      dbPriceVerified: false,
      offersApiVerified: false,
      offersCount: 0,
      frontendProductVerified: false,
      refreshAction: 'pending',
      refreshIdempotent: false,
    });
  }

  // 2. Real Store Scraping & Discovery Ingestion (allowCreate: true)
  console.log('\n▓▓▓ PHASE 2: REAL SCRAPING & DISCOVERY INGESTION (allowCreate: true) ▓▓▓\n');

  const scrapedPayloads: any[] = [];

  for (let i = 0; i < DISCOVERY_CASES.length; i++) {
    const tc = DISCOVERY_CASES[i];
    const r = executionResults[i];
    const dbStore = storeMap.get(tc.storeSlug);
    if (!dbStore) {
      r.error = `Store ${tc.storeSlug} not found`;
      continue;
    }

    try {
      console.log(`>>> [Case ${i + 1}/12] Executing discovery for ${tc.store}: "${tc.productName}"`);
      let parsed: any = null;

      if (tc.store === 'PriceOye') {
        const httpRes = await axios.get(tc.url, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000,
        });
        parsed = priceoye.extractProductFromHtml(httpRes.data, tc.url);
      } else if (tc.store === 'Telemart') {
        let rawShopify = tmProductCache.get(tc.shopifyHandle || '');
        if (!rawShopify) {
          const jsRes = await axios.get(`${tc.url}.js`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000,
          });
          rawShopify = jsRes.data;
        }
        parsed = telemart.extractFromShopifyProduct(rawShopify, 'https://www.telemart.pk');
      } else if (tc.store === 'Mega.pk') {
        const httpRes = await axios.get(tc.url, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000,
        });
        parsed = mega.extractFromHtml(httpRes.data, tc.url);
      } else if (tc.store === 'Shophive') {
        const httpRes = await axios.get(tc.url, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000,
        });
        parsed = shophive.extractProductFromHtml(httpRes.data, tc.url, 'mobiles');
      }

      if (!parsed || !parsed.price) {
        throw new Error(`Scraper failed to extract price from ${tc.url}`);
      }

      r.scrapedPrice = parsed.price;
      r.scrapedStock = parsed.inStock;
      r.scrapedIdentifier = parsed.sourceIdentifier;
      r.scrapedBrand = parsed.brand || tc.brand;

      console.log(`    Scraped: "${parsed.name}" | Rs. ${parsed.price} | InStock: ${parsed.inStock} | Brand: ${r.scrapedBrand} | Ident: ${parsed.sourceIdentifier}`);

      // Validate schema
      let validator = priceoye;
      if (tc.store === 'Telemart') validator = telemart;
      else if (tc.store === 'Mega.pk') validator = mega as any;
      else if (tc.store === 'Shophive') validator = shophive as any;

      const validPayload = validator.validateProduct(parsed);
      if (!validPayload) {
        throw new Error('Payload failed ScrapedProductSchema validation');
      }
      scrapedPayloads.push({ tc, payload: validPayload, dbStore });

      // Run ProductMatcher
      const matchResult = await matcher.match(validPayload, dbStore.id);
      r.matchStatus = matchResult.status;
      r.matchConfidence = matchResult.confidence;
      console.log(`    ProductMatcher Result: status=${matchResult.status}, confidence=${matchResult.confidence}, method=${matchResult.method || 'none'}`);

      // Run Discovery Ingestion with allowCreate: true
      const ingestResult = await ingestion.ingest(validPayload, dbStore.id, false, { allowCreate: true });
      r.ingestionAction = ingestResult.action;
      r.productId = ingestResult.productId || null;
      r.variantId = ingestResult.variantId || null;
      console.log(`    Ingestion Result: action=${ingestResult.action}, productId=${r.productId}, variantId=${r.variantId}`);

      // Verify in DB
      if (r.variantId) {
        const { data: priceRow } = await supabase
          .from('prices')
          .select('id, price, in_stock, store_id, product_url')
          .eq('variant_id', r.variantId)
          .eq('store_id', dbStore.id)
          .maybeSingle();

        r.dbPriceVerified = !!priceRow && priceRow.price === validPayload.price;
        console.log(`    DB Verification: priceRow found=${!!priceRow}, price=${priceRow?.price}, store_id=${priceRow?.store_id}`);

        // Fetch product slug for API check
        if (r.productId) {
          const { data: prod } = await supabase
            .from('products')
            .select('slug, name')
            .eq('id', r.productId)
            .single();
          r.productSlug = prod?.slug || null;
        }
      }

      console.log('');
    } catch (err: any) {
      r.error = err.message;
      console.log(`    ✗ Error: ${err.message}\n`);
    }
  }

  // 3. API Visibility Verification
  console.log('▓▓▓ PHASE 3: API VISIBILITY VERIFICATION (Offers API & Product Detail) ▓▓▓\n');

  for (let i = 0; i < executionResults.length; i++) {
    const r = executionResults[i];
    if (!r.productSlug) {
      console.log(`  [Case ${i + 1}/12] SKIPPED: No product slug available.`);
      continue;
    }

    try {
      // Offers endpoint
      const offersRes = await axios.get(`http://localhost:4000/api/v1/products/${r.productSlug}/offers`);
      if (offersRes.data.success && Array.isArray(offersRes.data.offers)) {
        r.offersCount = offersRes.data.offers.length;
        r.offersApiVerified = r.offersCount > 0;
      }

      // Product detail endpoint
      const detailRes = await axios.get(`http://localhost:4000/api/v1/products/${r.productSlug}`);
      if (detailRes.data.success && detailRes.data.data?.product) {
        r.frontendProductVerified = true;
      }

      console.log(`  [Case ${i + 1}/12] API for slug "${r.productSlug}":`);
      console.log(`    Offers API: ${r.offersApiVerified ? `PASS (${r.offersCount} store offers returned)` : 'FAIL'}`);
      console.log(`    Product Detail API: ${r.frontendProductVerified ? 'PASS (canonical product visible)' : 'FAIL'}`);
    } catch (apiErr: any) {
      console.log(`  [Case ${i + 1}/12] API query failed for "${r.productSlug}": ${apiErr.message}`);
    }
  }

  // 4. Refresh Idempotency Check (allowCreate: false)
  console.log('\n▓▓▓ PHASE 4: REFRESH SAFETY & IDEMPOTENCY CHECK (allowCreate: false) ▓▓▓\n');

  const { count: productsCountBefore } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantsCountBefore } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

  for (let i = 0; i < scrapedPayloads.length; i++) {
    const { tc, payload, dbStore } = scrapedPayloads[i];
    const r = executionResults.find(res => res.url === tc.url);
    if (!r || !r.variantId) continue;

    try {
      const refreshResult = await ingestion.ingest(payload, dbStore.id, false, { allowCreate: false });
      r.refreshAction = refreshResult.action;
      r.refreshIdempotent = ['updated_price', 'validation_corrected'].includes(refreshResult.action);

      console.log(`  [Case ${r.index}/12] Refresh for ${tc.store} "${tc.productName}":`);
      console.log(`    action: ${refreshResult.action} (idempotent: ${r.refreshIdempotent ? 'PASS' : 'FAIL'})`);
    } catch (refErr: any) {
      console.log(`  [Case ${r.index}/12] Refresh error: ${refErr.message}`);
    }
  }

  const { count: productsCountAfter } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantsCountAfter } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

  const productDiff = (productsCountAfter || 0) - (productsCountBefore || 0);
  const variantDiff = (variantsCountAfter || 0) - (variantsCountBefore || 0);

  console.log(`\n  Product Count Before/After Refresh: ${productsCountBefore} -> ${productsCountAfter} (Diff: ${productDiff})`);
  console.log(`  Variant Count Before/After Refresh: ${variantsCountBefore} -> ${variantsCountAfter} (Diff: ${variantDiff})`);

  // 5. Final Report & Metrics Table
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6L: FINAL VERIFICATION RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log('Case | Store    | Product Name                             | PreInDB | Live Price | Ingestion Action    | DB Price | Offers API | Refresh');
  console.log('-----|----------|------------------------------------------|---------|------------|---------------------|----------|------------|--------');

  let passCount = 0;
  for (const r of executionResults) {
    const preDb = r.preFlightInDb ? 'YES' : 'NO ';
    const priceStr = r.scrapedPrice ? `Rs ${r.scrapedPrice}`.padEnd(10) : 'N/A       ';
    const ingAct = r.ingestionAction.padEnd(19);
    const dbOk = r.dbPriceVerified ? '✓ ' : '✗ ';
    const apiOk = r.offersApiVerified ? '✓ ' : '✗ ';
    const refOk = r.refreshIdempotent ? '✓' : '✗';

    const isPassed = r.scrapedPrice !== null && r.dbPriceVerified && r.offersApiVerified && r.refreshIdempotent;
    if (isPassed) passCount++;

    console.log(
      `${String(r.index).padEnd(4)} | ${r.store.padEnd(8)} | ${r.productName.slice(0, 40).padEnd(40)} | ${preDb}   | ${priceStr} | ${ingAct} | ${dbOk.padEnd(8)} | ${apiOk.padEnd(10)} | ${refOk}`
    );
  }

  console.log('\n── Per-Store Discovery Breakdown ──');
  for (const store of ['PriceOye', 'Telemart', 'Mega.pk', 'Shophive']) {
    const storeCases = executionResults.filter(r => r.store === store);
    const discoveredNew = storeCases.filter(r => ['inserted_product', 'inserted_variant'].includes(r.ingestionAction));
    const matchedExisting = storeCases.filter(r => ['updated_price', 'validation_corrected'].includes(r.ingestionAction));
    const allDbPrices = storeCases.filter(r => r.dbPriceVerified);
    const allApiVisible = storeCases.filter(r => r.offersApiVerified);
    console.log(`  ${store.padEnd(10)}: Tested ${storeCases.length} | Discovered New: ${discoveredNew.length} | Matched Canonical: ${matchedExisting.length} | DB Verified: ${allDbPrices.length} | API Visible: ${allApiVisible.length}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${passCount}/12 PASSED`);
  console.log(`  DUPLICATE PRODUCTS CREATED ON REFRESH: ${productDiff}`);
  console.log(`  DUPLICATE VARIANTS CREATED ON REFRESH: ${variantDiff}`);
  if (passCount === 12 && productDiff === 0 && variantDiff === 0) {
    console.log('  ✅ 100% REAL DISCOVERY PROVEN ACROSS ALL 4 TIER-1 STORES');
  } else {
    console.log('  ❌ DISCOVERY GAPS DETECTED');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

run12CaseDiscoveryVerification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
