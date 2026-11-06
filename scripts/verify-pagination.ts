import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VERIFYING PAGINATION (hasMore=true and hasMore=false)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const favoriteRepo = new FavoriteRepository(db);
  const alertRepo = new AlertRepository(db);
  const searchRepo = new SearchHistoryRepository(db);
  const couponRepo = new CouponRepository(db);
  const bankOfferRepo = new BankOfferRepository(db);

  // 1. Fetch available store & variants for fixtures
  const { data: stores } = await db.from('stores').select('id').limit(1);
  const storeId = stores?.[0]?.id;
  if (!storeId) throw new Error('No store found in database');

  const { data: variants } = await db.from('product_variants').select('id').limit(10);
  if (!variants || variants.length < 6) {
    throw new Error(`Insufficient variants for testing: found ${variants?.length}`);
  }

  // 2. Create isolated test user
  const testEmail = `test_pagination_${Date.now()}@pakprice.internal`;
  const { data: authData, error: userError } = await db.auth.admin.createUser({
    email: testEmail,
    password: 'TestPassword123!',
    email_confirm: true,
  });

  if (userError || !authData.user) {
    throw new Error(`Failed to create test user: ${userError?.message}`);
  }
  const testUserId = authData.user.id;
  console.log(`Created isolated test user: ${testUserId} (${testEmail})`);

  const createdCouponIds: string[] = [];
  const createdBankOfferIds: string[] = [];

  try {
    // ── A. SEARCH HISTORY (6 records) ───────────────────────────────────────
    console.log('\n--- Testing Search History Pagination ---');
    for (let i = 1; i <= 6; i++) {
      await searchRepo.create(testUserId, `Search Query ${i}`, i * 2);
    }

    // Page 1 (limit: 5)
    const sPage1 = await searchRepo.findByUserId(testUserId, { page: 1, limit: 5 });
    console.log(`Search Page 1: returned ${sPage1.items.length} items, hasMore=${sPage1.pagination.hasMore}`);
    if (sPage1.items.length !== 5) throw new Error(`Expected 5 items, got ${sPage1.items.length}`);
    if (sPage1.pagination.hasMore !== true) throw new Error(`Expected hasMore=true, got ${sPage1.pagination.hasMore}`);

    // Page 2 (limit: 5)
    const sPage2 = await searchRepo.findByUserId(testUserId, { page: 2, limit: 5 });
    console.log(`Search Page 2: returned ${sPage2.items.length} items, hasMore=${sPage2.pagination.hasMore}`);
    if (sPage2.items.length !== 1) throw new Error(`Expected 1 item, got ${sPage2.items.length}`);
    if (sPage2.pagination.hasMore !== false) throw new Error(`Expected hasMore=false, got ${sPage2.pagination.hasMore}`);
    console.log('✓ Search History pagination verified (Page 1: 5 items, hasMore=true -> Page 2: 1 item, hasMore=false)');

    // ── B. FAVORITES (6 records) ───────────────────────────────────────────
    console.log('\n--- Testing Favorites Pagination ---');
    for (let i = 0; i < 6; i++) {
      await db.from('favorites').insert({
        user_id: testUserId,
        variant_id: variants[i].id,
      });
    }

    // Page 1 (limit: 5)
    const fPage1 = await favoriteRepo.findByUserId(testUserId, { page: 1, limit: 5 });
    console.log(`Favorites Page 1: returned ${fPage1.items.length} items, hasMore=${fPage1.pagination.hasMore}`);
    if (fPage1.items.length !== 5) throw new Error(`Expected 5 items, got ${fPage1.items.length}`);
    if (fPage1.pagination.hasMore !== true) throw new Error(`Expected hasMore=true, got ${fPage1.pagination.hasMore}`);

    // Page 2 (limit: 5)
    const fPage2 = await favoriteRepo.findByUserId(testUserId, { page: 2, limit: 5 });
    console.log(`Favorites Page 2: returned ${fPage2.items.length} items, hasMore=${fPage2.pagination.hasMore}`);
    if (fPage2.items.length !== 1) throw new Error(`Expected 1 item, got ${fPage2.items.length}`);
    if (fPage2.pagination.hasMore !== false) throw new Error(`Expected hasMore=false, got ${fPage2.pagination.hasMore}`);
    console.log('✓ Favorites pagination verified (Page 1: 5 items, hasMore=true -> Page 2: 1 item, hasMore=false)');

    // ── C. PRICE ALERTS (6 records) ────────────────────────────────────────
    console.log('\n--- Testing Price Alerts Pagination ---');
    for (let i = 0; i < 6; i++) {
      await db.from('price_alerts').insert({
        user_id: testUserId,
        variant_id: variants[i].id,
        target_price: 50000 + i * 1000,
        is_active: true,
      });
    }

    // Page 1 (limit: 5)
    const aPage1 = await alertRepo.findByUserId(testUserId, { page: 1, limit: 5 });
    console.log(`Alerts Page 1: returned ${aPage1.items.length} items, hasMore=${aPage1.pagination.hasMore}`);
    if (aPage1.items.length !== 5) throw new Error(`Expected 5 items, got ${aPage1.items.length}`);
    if (aPage1.pagination.hasMore !== true) throw new Error(`Expected hasMore=true, got ${aPage1.pagination.hasMore}`);

    // Page 2 (limit: 5)
    const aPage2 = await alertRepo.findByUserId(testUserId, { page: 2, limit: 5 });
    console.log(`Alerts Page 2: returned ${aPage2.items.length} items, hasMore=${aPage2.pagination.hasMore}`);
    if (aPage2.items.length !== 1) throw new Error(`Expected 1 item, got ${aPage2.items.length}`);
    if (aPage2.pagination.hasMore !== false) throw new Error(`Expected hasMore=false, got ${aPage2.pagination.hasMore}`);
    console.log('✓ Price Alerts pagination verified (Page 1: 5 items, hasMore=true -> Page 2: 1 item, hasMore=false)');

    // ── D. COUPONS (6 test fixtures) ───────────────────────────────────────
    console.log('\n--- Testing Coupons Pagination ---');
    for (let i = 1; i <= 6; i++) {
      const { data: cp, error: cErr } = await db.from('coupons').insert({
        store_id: storeId,
        code: `TESTCPN_${Date.now()}_${i}`,
        discount_type: 'percent',
        discount_value: 10 + i,
        is_active: true,
        valid_until: new Date(Date.now() + 86400000).toISOString(),
      }).select('id').single();
      if (cErr) throw new Error(`Failed to insert test coupon: ${cErr.message}`);
      if (cp) createdCouponIds.push(cp.id);
    }

    const cPage1 = await couponRepo.findActive(storeId, { page: 1, limit: 5 });
    console.log(`Coupons Page 1: returned ${cPage1.items.length} items, hasMore=${cPage1.pagination.hasMore}`);
    if (cPage1.items.length !== 5) throw new Error(`Expected 5 items, got ${cPage1.items.length}`);
    if (cPage1.pagination.hasMore !== true) throw new Error(`Expected hasMore=true, got ${cPage1.pagination.hasMore}`);

    const cPage2 = await couponRepo.findActive(storeId, { page: 2, limit: 5 });
    console.log(`Coupons Page 2: returned ${cPage2.items.length} items, hasMore=${cPage2.pagination.hasMore}`);
    if (cPage2.items.length !== 1) throw new Error(`Expected 1 item, got ${cPage2.items.length}`);
    if (cPage2.pagination.hasMore !== false) throw new Error(`Expected hasMore=false, got ${cPage2.pagination.hasMore}`);
    console.log('✓ Coupons pagination verified (Page 1: 5 items, hasMore=true -> Page 2: 1 item, hasMore=false)');

    // ── E. BANK OFFERS (6 test fixtures) ───────────────────────────────────
    console.log('\n--- Testing Bank Offers Pagination ---');
    const testBankName = `TestBank_${Date.now()}`;
    for (let i = 1; i <= 6; i++) {
      const { data: bo } = await db.from('bank_offers').insert({
        store_id: storeId,
        bank_name: testBankName,
        card_type: 'Credit Card',
        discount_percent: 15,
        is_active: true,
        valid_until: new Date(Date.now() + 86400000).toISOString(),
      }).select('id').single();
      if (bo) createdBankOfferIds.push(bo.id);
    }

    const bPage1 = await bankOfferRepo.findActive({ bankName: testBankName }, { page: 1, limit: 5 });
    console.log(`Bank Offers Page 1: returned ${bPage1.items.length} items, hasMore=${bPage1.pagination.hasMore}`);
    if (bPage1.items.length !== 5) throw new Error(`Expected 5 items, got ${bPage1.items.length}`);
    if (bPage1.pagination.hasMore !== true) throw new Error(`Expected hasMore=true, got ${bPage1.pagination.hasMore}`);

    const bPage2 = await bankOfferRepo.findActive({ bankName: testBankName }, { page: 2, limit: 5 });
    console.log(`Bank Offers Page 2: returned ${bPage2.items.length} items, hasMore=${bPage2.pagination.hasMore}`);
    if (bPage2.items.length !== 1) throw new Error(`Expected 1 item, got ${bPage2.items.length}`);
    if (bPage2.pagination.hasMore !== false) throw new Error(`Expected hasMore=false, got ${bPage2.pagination.hasMore}`);
    console.log('✓ Bank Offers pagination verified');

    console.log('\n=============================================================');
    console.log('  ALL PAGINATION hasMore=true / hasMore=false TESTS PASSED');
    console.log('=============================================================\n');

  } finally {
    console.log('Cleaning up test fixtures...');
    if (createdCouponIds.length > 0) {
      await db.from('coupons').delete().in('id', createdCouponIds);
    }
    if (createdBankOfferIds.length > 0) {
      await db.from('bank_offers').delete().in('id', createdBankOfferIds);
    }
    if (testUserId) {
      await db.from('favorites').delete().eq('user_id', testUserId);
      await db.from('price_alerts').delete().eq('user_id', testUserId);
      await db.from('search_history').delete().eq('user_id', testUserId);
      await db.auth.admin.deleteUser(testUserId);
    }
    console.log('Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('Pagination verification failed:', err);
  process.exit(1);
});
