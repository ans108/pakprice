import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const db = createClient(supabaseUrl, supabaseKey);

// Import repositories & services from apps/api
import { ProductService } from '../apps/api/src/services/productService';
import { PriceHistoryService } from '../apps/api/src/services/priceHistoryService';
import { FavoriteRepository } from '../apps/api/src/repositories/favoriteRepository';
import { AlertRepository } from '../apps/api/src/repositories/alertRepository';
import { CouponRepository } from '../apps/api/src/repositories/couponRepository';
import { BankOfferRepository } from '../apps/api/src/repositories/bankOfferRepository';

async function timeOperation<T>(name: string, fn: () => Promise<T>): Promise<{ name: string; durationMs: number; resultCount: number; payloadBytes: number }> {
  // Warmup run
  await fn();

  // 3 timed runs averaged
  const runs: number[] = [];
  let lastResult: any = null;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    lastResult = await fn();
    const end = performance.now();
    runs.push(end - start);
  }
  const avgDuration = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
  const json = JSON.stringify(lastResult ?? {});
  const payloadBytes = Buffer.byteLength(json, 'utf8');

  let resultCount = 0;
  if (Array.isArray(lastResult)) {
    resultCount = lastResult.length;
  } else if (lastResult?.data && Array.isArray(lastResult.data)) {
    resultCount = lastResult.data.length;
  } else if (lastResult?.products && Array.isArray(lastResult.products)) {
    resultCount = lastResult.products.length;
  } else if (lastResult?.points && Array.isArray(lastResult.points)) {
    resultCount = lastResult.points.length;
  } else if (lastResult?.rows && Array.isArray(lastResult.rows)) {
    resultCount = lastResult.rows.length;
  } else if (lastResult) {
    resultCount = 1;
  }

  return {
    name,
    durationMs: avgDuration,
    resultCount,
    payloadBytes
  };
}

async function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  BASELINE PERFORMANCE BENCHMARK (REAL DATA)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const productService = new ProductService(db);
  const priceHistoryService = new PriceHistoryService();
  const favoriteRepo = new FavoriteRepository(db);
  const alertRepo = new AlertRepository(db);
  const couponRepo = new CouponRepository(db);
  const bankOfferRepo = new BankOfferRepository(db);

  const testSlug = 'unknown-infinix-smart-20';
  const compareSlugs = [
    'unknown-infinix-smart-20',
    'unknown-nothing-cmf-phone-1-5g',
    'unknown-sego-epicx',
    'unknown-vgo-tel-i252'
  ];
  const dummyUserId = '00000000-0000-0000-0000-000000000000';

  const results = [];

  // 1. Product Search
  results.push(await timeOperation('1. Product Search (q="infinix", limit=20)', () => 
    productService.listProducts({
      q: 'infinix',
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 }
    })
  ));

  // 2. Product Listing
  results.push(await timeOperation('2. Product Listing (page=1, limit=20)', () =>
    productService.listProducts({
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 }
    })
  ));

  // 3. Product Detail
  results.push(await timeOperation('3. Product Detail (slug="unknown-infinix-smart-20")', () =>
    productService.getProductDetail(testSlug)
  ));

  // 4. Compare API
  results.push(await timeOperation('4. Compare (4 products)', () =>
    productService.getProductsBySlugs(compareSlugs)
  ));

  // 5. Favorites
  results.push(await timeOperation('5. Favorites (findByUserId)', () =>
    favoriteRepo.findByUserId(dummyUserId)
  ));

  // 6. Price Alerts
  results.push(await timeOperation('6. Price Alerts (findByUserId)', () =>
    alertRepo.findByUserId(dummyUserId)
  ));

  // 7. Price History
  results.push(await timeOperation('7. Price History (slug="unknown-infinix-smart-20", range="30d")', () =>
    priceHistoryService.getPriceHistory(testSlug, '30d')
  ));
  results.push(await timeOperation('7b. Price History (slug="unknown-infinix-smart-20", range="all")', () =>
    priceHistoryService.getPriceHistory(testSlug, 'all')
  ));

  // 8. Coupons
  results.push(await timeOperation('8. Coupons (findActive)', () =>
    couponRepo.findActive()
  ));

  // 9. Bank Offers
  results.push(await timeOperation('9. Bank Offers (findActive)', () =>
    bankOfferRepo.findActive()
  ));

  console.table(results);
}

run().catch(console.error);
