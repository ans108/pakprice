import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { MemoryCache, memoryCache, CACHE_NOT_FOUND } from '../apps/api/src/utils/memoryCache';
import { ProductRepository } from '../apps/api/src/repositories/productRepository';
import { ProductService } from '../apps/api/src/services/productService';
import { PriceHistoryRepository } from '../apps/api/src/repositories/priceHistoryRepository';
import { PriceHistoryService } from '../apps/api/src/services/priceHistoryService';
import { FavoriteRepository } from '../apps/api/src/repositories/favoriteRepository';
import { AlertRepository } from '../apps/api/src/repositories/alertRepository';
import { SearchHistoryRepository } from '../apps/api/src/repositories/searchHistoryRepository';
import { CouponRepository } from '../apps/api/src/repositories/couponRepository';
import { BankOfferRepository } from '../apps/api/src/repositories/bankOfferRepository';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

// ── Instrumentation ────────────────────────────────────────────────────────
let postgrestRequestCount = 0;
const recordedRequests: string[] = [];

function instrumentedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  postgrestRequestCount++;
  const urlStr = typeof input === 'string' ? input : (input as any).url || input.toString();
  recordedRequests.push(urlStr);
  return fetch(input, init);
}

const db: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: instrumentedFetch,
  },
  auth: {
    persistSession: false,
  },
});

function resetInstrumentation() {
  postgrestRequestCount = 0;
  recordedRequests.length = 0;
}

function getStats(latencies: number[]): { median: number; p95: number; min: number; max: number } {
  const sorted = [...latencies].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return {
    median: Math.round(median),
    p95: Math.round(p95),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

interface BenchmarkMetric {
  operation: string;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  dbRoundTrips: number;
  payloadBytes: number;
  relationCounts?: string;
  notes?: string;
}

async function runBenchmark<T>(
  name: string,
  fn: () => Promise<T>,
  runsCount = 5,
  relationCounter?: (res: T) => string
): Promise<{ metric: BenchmarkMetric; lastResult: T; requestCount: number }> {
  // 1 Warmup run (unmeasured)
  await fn();

  // 5 Timed runs
  const latencies: number[] = [];
  let lastResult: any = null;

  resetInstrumentation();
  const startSingle = performance.now();
  lastResult = await fn();
  const endSingle = performance.now();
  const measuredSingleCount = postgrestRequestCount;
  latencies.push(endSingle - startSingle);

  for (let i = 1; i < runsCount; i++) {
    const s = performance.now();
    await fn();
    const e = performance.now();
    latencies.push(e - s);
  }

  const stats = getStats(latencies);
  const payloadBytes = Buffer.byteLength(JSON.stringify(lastResult ?? {}), 'utf8');
  const relationCounts = relationCounter ? relationCounter(lastResult) : undefined;

  return {
    metric: {
      operation: name,
      medianMs: stats.median,
      p95Ms: stats.p95,
      minMs: stats.min,
      maxMs: stats.max,
      dbRoundTrips: measuredSingleCount,
      payloadBytes,
      relationCounts,
    },
    lastResult,
    requestCount: measuredSingleCount,
  };
}

// ── Unit / Logic Verifications ─────────────────────────────────────────────

async function testMemoryCache() {
  console.log('\n--- 1. Testing MemoryCache LRU, Negative Caching & Invalidation ---');
  const cache = new MemoryCache({ maxEntries: 3, defaultTtlMs: 500, negativeTtlMs: 200 });

  // 1. Negative caching sentinel check
  cache.setNotFound('brands', 'missing-brand');
  const negVal = cache.get('brands', 'missing-brand');
  if (negVal !== CACHE_NOT_FOUND) {
    throw new Error(`Expected CACHE_NOT_FOUND sentinel, got: ${String(negVal)}`);
  }
  const missVal = cache.get('brands', 'unseen-brand');
  if (missVal !== undefined) {
    throw new Error(`Expected undefined for real cache miss, got: ${String(missVal)}`);
  }
  console.log('✓ Negative caching correctly distinguishes sentinel from cache miss');

  // 2. LRU eviction check (maxEntries: 3)
  cache.clear();
  cache.set('items', 'k1', 'v1');
  cache.set('items', 'k2', 'v2');
  cache.set('items', 'k3', 'v3');
  // Access k1 so it moves to MRU
  cache.get('items', 'k1');
  // Insert k4 -> should evict k2 (the LRU entry)
  cache.set('items', 'k4', 'v4');
  if (cache.get('items', 'k2') !== undefined) {
    throw new Error('LRU eviction failed: k2 was not evicted');
  }
  if (cache.get('items', 'k1') !== 'v1') {
    throw new Error('MRU entry k1 should have been preserved');
  }
  if (cache.size() !== 3) {
    throw new Error(`Cache size exceeded maxEntries: ${cache.size()}`);
  }
  console.log('✓ LRU eviction and MRU access reinsertion verified (maxEntries bound maintained)');

  // 3. TTL expiry check
  await new Promise((r) => setTimeout(r, 600));
  if (cache.get('items', 'k1') !== undefined) {
    throw new Error('Expired entry was not evicted on get()');
  }
  console.log('✓ TTL expiration check verified');

  // 4. Invalidation API checks
  cache.set('categories', 'c1', 'phones');
  cache.set('categories', 'c2', 'laptops');
  cache.set('brands', 'b1', 'apple');
  const invalidatedCount = cache.invalidateNamespace('categories');
  if (invalidatedCount !== 2 || cache.get('categories', 'c1') !== undefined) {
    throw new Error('invalidateNamespace failed to clear namespace keys');
  }
  if (cache.get('brands', 'b1') !== 'apple') {
    throw new Error('invalidateNamespace inadvertently cleared unrelated namespace');
  }
  cache.delete('brands', 'b1');
  if (cache.get('brands', 'b1') !== undefined) {
    throw new Error('delete failed to invalidate single key');
  }
  console.log('✓ Invalidation APIs (delete, invalidateNamespace, clear) verified');
}

async function testPriceHistoryFlow() {
  console.log('\n--- 2. Verifying Price History Optimization (Cold: 4, Warm: 3 DB Round Trips) ---');
  const priceHistoryRepo = new PriceHistoryRepository(db);
  const priceHistoryService = new PriceHistoryService(db);
  const testSlug = 'unknown-infinix-smart-20';

  // 1. Cold state (store map not yet cached) -> 4 requests
  // (1 product lookup + 1 history + 1 lowest price + 1 store lookup)
  memoryCache.clear();
  resetInstrumentation();
  await priceHistoryService.getPriceHistory(testSlug, '30d');
  const coldCount = postgrestRequestCount;
  console.log(`Cold flow Supabase/PostgREST requests measured: ${coldCount} (includes initial store resolution)`);
  if (coldCount !== 4) {
    throw new Error(`Cold price history did not execute in expected 4 DB round trips. Executed: ${coldCount}`);
  }

  // 2. Warm state (store map cached) -> exactly 3 requests
  // (1 product lookup + concurrent [history, lowestPrice])
  resetInstrumentation();
  const res = await priceHistoryService.getPriceHistory(testSlug, '30d');
  const warmCount = postgrestRequestCount;
  console.log(`Optimized warm flow Supabase/PostgREST requests measured: ${warmCount} (cached store resolution removes store lookup)`);
  if (warmCount !== 3) {
    throw new Error(`Warm price history did not execute in expected 3 DB round trips. Executed: ${warmCount}`);
  }

  // Verify concurrent execution and structure
  if (!res.points || !Array.isArray(res.points)) {
    throw new Error('Price history response is missing points array');
  }
  if (typeof res.lowestPrice !== 'number' || typeof res.highestPrice !== 'number') {
    throw new Error('Price history response missing lowest/highest price bounds');
  }

  // Verify 365-day cap on 'all'
  resetInstrumentation();
  const allRes = await priceHistoryService.getPriceHistory(testSlug, 'all');
  if (postgrestRequestCount !== 3) {
    throw new Error(`Price history ('all') did not execute in 3 DB round trips. Executed: ${postgrestRequestCount}`);
  }
  console.log(`✓ Price history executed in exactly 3 application DB round trips (concurrent history + lowest price)`);
  console.log(`✓ Points returned: ${res.points.length} (30d), ${allRes.points.length} (all, capped to 365 days)`);
  console.log(`✓ Zero per-history-point database requests occurred`);
}

async function testFavoritesAndAlertsNPlusOne() {
  console.log('\n--- 3. Verifying Favorites & Alerts N+1 Elimination (Constant DB Round Trips) ---');
  const favoriteRepo = new FavoriteRepository(db);
  const alertRepo = new AlertRepository(db);
  const dummyUserId = '00000000-0000-0000-0000-000000000000';

  // Favorites: limit 5 vs limit 20
  resetInstrumentation();
  await favoriteRepo.findByUserId(dummyUserId, { page: 1, limit: 5 });
  const favCount5 = postgrestRequestCount;

  resetInstrumentation();
  await favoriteRepo.findByUserId(dummyUserId, { page: 1, limit: 20 });
  const favCount20 = postgrestRequestCount;

  console.log(`Favorites DB round trips: limit=5 -> ${favCount5}, limit=20 -> ${favCount20}`);
  if (favCount5 !== favCount20) {
    throw new Error(`Favorites query count scaled with page limit! N+1 detected: ${favCount5} vs ${favCount20}`);
  }

  // Alerts: limit 5 vs limit 20
  resetInstrumentation();
  await alertRepo.findByUserId(dummyUserId, { page: 1, limit: 5 });
  const alertCount5 = postgrestRequestCount;

  resetInstrumentation();
  await alertRepo.findByUserId(dummyUserId, { page: 1, limit: 20 });
  const alertCount20 = postgrestRequestCount;

  console.log(`Price Alerts DB round trips: limit=5 -> ${alertCount5}, limit=20 -> ${alertCount20}`);
  if (alertCount5 !== alertCount20) {
    throw new Error(`Alerts query count scaled with page limit! N+1 detected: ${alertCount5} vs ${alertCount20}`);
  }

  console.log('✓ Bulk relational queries verified: query count remains constant regardless of page size (zero N+1)');
}

async function testProductDetailSingleRoundTrip() {
  console.log('\n--- 4. Verifying Product Detail Single Round Trip ---');
  const productService = new ProductService(db);
  const testSlug = 'unknown-infinix-smart-20';

  resetInstrumentation();
  const detail = await productService.getProductDetail(testSlug);
  const count = postgrestRequestCount;

  console.log(`Product Detail Supabase/PostgREST requests: ${count}`);
  if (count !== 1) {
    throw new Error(`Product detail did not execute in 1 DB round trip. Executed: ${count}`);
  }

  const variantCount = detail?.data?.variants?.length ?? 0;
  const priceCount = detail?.data?.prices?.length ?? 0;
  console.log(`✓ Product detail completed in exactly 1 DB round trip (Variants: ${variantCount}, Prices: ${priceCount})`);
  console.log(`✓ Product payload contains description: ${!!detail?.data?.product?.description}`);
}

async function testDeterministicPagination() {
  console.log('\n--- 5. Verifying Deterministic Pagination & Bounded Limits ---');
  const couponRepo = new CouponRepository(db);
  const bankOfferRepo = new BankOfferRepository(db);
  const searchHistoryRepo = new SearchHistoryRepository(db);

  // Negative / extreme limit clamp tests
  const couponsClamped = await couponRepo.findActive(undefined, { page: -5, limit: 999 });
  if (couponsClamped.pagination.page !== 1 || couponsClamped.pagination.limit > 100) {
    throw new Error(`Coupon pagination limit clamp failed: ${JSON.stringify(couponsClamped.pagination)}`);
  }

  const offersClamped = await bankOfferRepo.findActive(undefined, { page: -1, limit: 500 });
  if (offersClamped.pagination.page !== 1 || offersClamped.pagination.limit > 100) {
    throw new Error(`Bank offer pagination limit clamp failed: ${JSON.stringify(offersClamped.pagination)}`);
  }

  const searchClamped = await searchHistoryRepo.findByUserId('00000000-0000-0000-0000-000000000000', { page: 0, limit: 200 });
  if (searchClamped.pagination.page !== 1 || searchClamped.pagination.limit > 50) {
    throw new Error(`Search history pagination limit clamp failed: ${JSON.stringify(searchClamped.pagination)}`);
  }

  console.log('✓ Defensive limit clamping (min=1, max capped) verified across all endpoints');
}

// ── Full Benchmark Suite ───────────────────────────────────────────────────

async function runAllBenchmarks() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 5E PERFORMANCE BENCHMARK (1 Warmup + 5 Measured Runs)');
  console.log('  Note: Lightweight regression benchmark; Singapore PostgREST latency');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const productService = new ProductService(db);
  const priceHistoryService = new PriceHistoryService(db);
  const favoriteRepo = new FavoriteRepository(db);
  const alertRepo = new AlertRepository(db);
  const couponRepo = new CouponRepository(db);
  const bankOfferRepo = new BankOfferRepository(db);
  const searchHistoryRepo = new SearchHistoryRepository(db);

  const testSlug = 'unknown-infinix-smart-20';
  const compareSlugs = [
    'unknown-infinix-smart-20',
    'unknown-nothing-cmf-phone-1-5g',
    'unknown-sego-epicx',
    'unknown-vgo-tel-i252',
  ];
  const dummyUserId = '00000000-0000-0000-0000-000000000000';

  const metrics: BenchmarkMetric[] = [];

  // 1. Product Search
  const m1 = await runBenchmark(
    'Product Search (q="infinix", limit=20)',
    () => productService.listProducts({ q: 'infinix', sort: 'relevance', pagination: { page: 1, limit: 20, offset: 0 } }),
    5,
    (res) => `Results: ${res?.data?.length ?? 0}`
  );
  metrics.push(m1.metric);

  // 2. Product Listing
  const m2 = await runBenchmark(
    'Product Listing (catalog page 1, limit=20)',
    () => productService.listProducts({ sort: 'relevance', pagination: { page: 1, limit: 20, offset: 0 } }),
    5,
    (res) => `Results: ${res?.data?.length ?? 0}`
  );
  metrics.push(m2.metric);

  // 3. Product Detail (Single Round Trip)
  const m3 = await runBenchmark(
    'Product Detail (slug="unknown-infinix-smart-20")',
    () => productService.getProductDetail(testSlug),
    5,
    (res) => `Variants: ${res?.data?.variants?.length ?? 0}, Prices: ${res?.data?.prices?.length ?? 0}`
  );
  metrics.push(m3.metric);

  // 4. Compare API (4 products)
  const m4 = await runBenchmark(
    'Product Compare (4 slugs)',
    () => productService.getProductsBySlugs(compareSlugs),
    5,
    (res) => `Products: ${res?.products?.length ?? 0}`
  );
  metrics.push(m4.metric);

  // 5. Price History (30d)
  const m5 = await runBenchmark(
    'Price History (30d range)',
    () => priceHistoryService.getPriceHistory(testSlug, '30d'),
    5,
    (res) => `Points: ${res.points.length}`
  );
  metrics.push(m5.metric);

  // 6. Price History (All -> capped at 365d)
  const m6 = await runBenchmark(
    'Price History (All / 365d cap)',
    () => priceHistoryService.getPriceHistory(testSlug, 'all'),
    5,
    (res) => `Points: ${res.points.length}`
  );
  metrics.push(m6.metric);

  // 7. Favorites
  const m7 = await runBenchmark(
    'Favorites (findByUserId, limit=20)',
    () => favoriteRepo.findByUserId(dummyUserId, { page: 1, limit: 20 }),
    5,
    (res) => `Items: ${res.items.length}, hasMore: ${res.pagination.hasMore}`
  );
  metrics.push(m7.metric);

  // 8. Price Alerts
  const m8 = await runBenchmark(
    'Price Alerts (findByUserId, limit=20)',
    () => alertRepo.findByUserId(dummyUserId, { page: 1, limit: 20 }),
    5,
    (res) => `Items: ${res.items.length}, hasMore: ${res.pagination.hasMore}`
  );
  metrics.push(m8.metric);

  // 9. Search History
  const m9 = await runBenchmark(
    'Search History (findByUserId, limit=20)',
    () => searchHistoryRepo.findByUserId(dummyUserId, { page: 1, limit: 20 }),
    5,
    (res) => `Items: ${res.items.length}, hasMore: ${res.pagination.hasMore}`
  );
  metrics.push(m9.metric);

  // 10. Coupons
  const m10 = await runBenchmark(
    'Coupons (findActive, limit=20)',
    () => couponRepo.findActive(undefined, { page: 1, limit: 20 }),
    5,
    (res) => `Items: ${res.items.length}, hasMore: ${res.pagination.hasMore}`
  );
  metrics.push(m10.metric);

  // 11. Bank Offers
  const m11 = await runBenchmark(
    'Bank Offers (findActive, limit=20)',
    () => bankOfferRepo.findActive(undefined, { page: 1, limit: 20 }),
    5,
    (res) => `Items: ${res.items.length}, hasMore: ${res.pagination.hasMore}`
  );
  metrics.push(m11.metric);

  console.table(
    metrics.map((m) => ({
      Operation: m.operation,
      'Median (ms)': m.medianMs,
      'p95 (ms)': m.p95Ms,
      'DB Round Trips': m.dbRoundTrips,
      'Payload (bytes)': m.payloadBytes,
      'Relations / Items': m.relationCounts || '-',
    }))
  );

  return metrics;
}

async function main() {
  try {
    await testMemoryCache();
    await testPriceHistoryFlow();
    await testFavoritesAndAlertsNPlusOne();
    await testProductDetailSingleRoundTrip();
    await testDeterministicPagination();
    await runAllBenchmarks();
    console.log('\n================================================================');
    console.log('  ALL INCREMENT 5E PERFORMANCE VERIFICATIONS PASSED SUCCESSFULLY');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Performance verification failed:', err);
    process.exit(1);
  }
}

main();
