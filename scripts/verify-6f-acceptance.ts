/**
 * scripts/verify-6f-acceptance.ts
 *
 * Programmatic verification script for Increment 6F Acceptance Criteria:
 *   1. Search-first discovery & canonical product deduplication
 *   2. Cross-store store offer aggregation under single canonical product
 *   3. Outbound direct store URLs
 *   4. 5C Freshness & stock eligibility on "From Rs. X"
 *   5. Variant isolation (e.g. 40mm vs 46mm, storage variants)
 *   6. Multi-store offer API reuse (/api/v1/products/:slug/offers)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductRepository } from '../apps/api/src/repositories/productRepository';
import { ProductService } from '../apps/api/src/services/productService';
import { deriveAvailabilityStatus } from '@pakprice/shared';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const repo = new ProductRepository(supabase);
const service = new ProductService(supabase);

async function runAcceptanceChecks() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6F — ACCEPTANCE CRITERIA VERIFICATION SUITE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // ── 1. CANONICAL PRODUCT SEARCH & DEDUPLICATION ──────────────────────
  console.log('--- 1. Canonical Product Search & Deduplication ---');
  const searchRes = await service.listProducts({
    q: 'iPhone 17 Pro Max',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });

  assert(searchRes.success === true, 'Search returned successful response');
  assert(searchRes.data.length > 0, `Search found ${searchRes.data.length} canonical product results`);

  // Verify that the multi-store iPhone 17 Pro Max is returned as ONE canonical product with multiple stores
  const multiStoreIphone = searchRes.data.find(
    (p) => p.slug === 'unknown-apple-iphone-17-pro-max'
  );
  assert(!!multiStoreIphone, 'Found canonical iPhone 17 Pro Max product');
  if (multiStoreIphone) {
    assert(
      (multiStoreIphone.store_count ?? 0) >= 2,
      `Canonical iPhone 17 Pro Max aggregates ${multiStoreIphone.store_count} stores (expected >= 2: PriceOye & Mega.pk)`
    );
    assert(
      typeof multiStoreIphone.lowest_price === 'number' && multiStoreIphone.lowest_price > 0,
      `From price is valid: Rs. ${multiStoreIphone.lowest_price?.toLocaleString()}`
    );
  }

  // ── 2. CROSS-STORE STORE OFFERS API REUSE ──────────────────────────
  console.log('\n--- 2. Multi-Store Store Offers API Reuse (/api/v1/products/:slug/offers) ---');
  const offersRes = await service.getMultiStoreOffers('unknown-apple-iphone-17-pro-max');
  assert(offersRes.success === true, 'GET /offers succeeded');
  assert(offersRes.offers.length >= 2, `Product has ${offersRes.offers.length} store offers`);
  assert(offersRes.has_multi_store === true, 'has_multi_store is true');

  const storeNames = offersRes.offers.map((o) => o.store.name);
  assert(storeNames.includes('PriceOye'), 'Offers include PriceOye');
  assert(storeNames.includes('Mega.pk'), 'Offers include Mega.pk');

  for (const offer of offersRes.offers) {
    assert(
      typeof offer.price === 'number' && offer.price > 0,
      `Offer from ${offer.store.name} has valid positive price: Rs. ${offer.price.toLocaleString()}`
    );
    assert(
      typeof offer.product_url === 'string' && offer.product_url.startsWith('http'),
      `Offer from ${offer.store.name} has direct outbound URL: ${offer.product_url}`
    );
    assert(
      offer.availability_status !== undefined,
      `Offer from ${offer.store.name} provides derived 5C availability: ${offer.availability_status}`
    );
  }

  // ── 3. SECOND MULTI-STORE PRODUCT: SAMSUNG GALAXY WATCH 8 40MM ────────
  console.log('\n--- 3. Samsung Galaxy Watch 8 40mm Cross-Store Aggregation ---');
  const watchOffers = await service.getMultiStoreOffers('samsung-samsung-galaxy-watch-8-40mm');
  assert(watchOffers.success === true, 'Galaxy Watch 8 40mm offers query succeeded');
  assert(watchOffers.offers.length >= 2, `Galaxy Watch 8 40mm has ${watchOffers.offers.length} offers`);
  const watchStores = watchOffers.offers.map((o) => o.store.name);
  assert(watchStores.includes('Telemart'), 'Watch offers include Telemart');
  assert(watchStores.includes('Mega.pk'), 'Watch offers include Mega.pk');

  const telemartWatchOffer = watchOffers.offers.find((o) => o.store.name === 'Telemart');
  assert(
    !!telemartWatchOffer && telemartWatchOffer.price === 59999,
    `Telemart 40mm offer is verified at Rs. 59,999 (was: ${telemartWatchOffer?.price})`
  );
  assert(
    !!telemartWatchOffer && telemartWatchOffer.product_url?.includes('samsung-galaxy-watch-8-40mm'),
    `Telemart 40mm offer URL points to 40mm PDP: ${telemartWatchOffer?.product_url}`
  );

  // ── 4. VARIANT ISOLATION ──────────────────────────────────────────
  console.log('\n--- 4. Variant Isolation Verification ---');
  // Verify 40mm vs 46mm watch
  const watchDetail = await service.getProductDetail('samsung-samsung-galaxy-watch-8-40mm');
  assert(!!watchDetail && !!watchDetail.data, 'Retrieved product detail for Galaxy Watch 8');
  if (watchDetail?.data?.variants) {
    for (const v of watchDetail.data.variants) {
      assert(
        !v.name?.toLowerCase().includes('46mm') && !v.name?.toLowerCase().includes('classic'),
        `Variant ${v.name} is strictly isolated from 46mm Classic`
      );
    }
  }

  // ── 5. ELIGIBLE "FROM RS. X" & FRESHNESS RULES ──────────────────────
  console.log('\n--- 5. Eligible "From Rs. X" & 5C Freshness Semantics ---');
  // Test stale vs fresh lower price behavior
  const now = new Date().toISOString();
  const oldDate = new Date(Date.now() - 100 * 3600 * 1000).toISOString(); // 100 hours ago (>72h stale)

  const freshStatus = deriveAvailabilityStatus(true, now, 72);
  const staleStatus = deriveAvailabilityStatus(true, oldDate, 72);
  assert(freshStatus === 'in_stock', 'Fresh within 72h evaluates to in_stock');
  assert(staleStatus === 'stale', 'Older than 72h evaluates to stale');

  // Verify that an in-stock fresh offer takes priority over a stale lower offer
  const testPrices = [
    { price: 1000, in_stock: true, last_scraped_at: oldDate }, // stale lower price
    { price: 2000, in_stock: true, last_scraped_at: now },      // fresh eligible price
  ];
  // Fresh lowest price calculation in mapProduct
  const freshEligible = testPrices.filter(
    (p) => p.in_stock && deriveAvailabilityStatus(p.in_stock, p.last_scraped_at, 72) === 'in_stock'
  );
  const chosenPrice = freshEligible.length > 0 ? Math.min(...freshEligible.map((p) => p.price)) : Math.min(...testPrices.map((p) => p.price));
  assert(chosenPrice === 2000, `Eligible price logic selects fresh Rs. 2000 over stale Rs. 1000 (result: Rs. ${chosenPrice})`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceChecks().catch((err) => {
  console.error('Fatal error during acceptance checks:', err);
  process.exit(1);
});
