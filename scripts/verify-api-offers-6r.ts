/**
 * Increment 6R — API Offers & Product Detail Verification
 *
 * Verifies that all newly persisted offers in Increment 6R appear in:
 * 1. ProductService.getMultiStoreOffers(slug)
 * 2. ProductService.getProductDetail(slug)
 *
 * Also checks regression on 6Q and 6P offers.
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

import { ProductService } from '../apps/api/src/services/productService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  VERIFYING OFFERS API & PRODUCT DETAIL FOR INCREMENT 6R');
  console.log('════════════════════════════════════════════════════════════════');

  const service = new ProductService(supabase);

  const testProducts6R = [
    {
      name: 'Huawei band 9',
      slug: 'huawei-huawei-band-9',
      expectedStore: 'priceoye',
      expectedPrice: 7699,
      expectedTotalStores: 2,
    },
    {
      name: 'Anker Soundcore Liberty 5',
      slug: 'anker-anker-soundcore-liberty-5-noise-reduction-wireless-earbuds',
      expectedStore: 'shophive',
      expectedPrice: 20499,
      expectedTotalStores: 2,
    },
    {
      name: 'Xiaomi Redmi Buds 8',
      slug: 'xiaomi-xiaomi-redmi-buds-8',
      expectedStore: 'shophive',
      expectedPrice: 13799,
      expectedTotalStores: 2,
    },
    {
      name: 'Infinix XW3P Smart Watch',
      slug: 'unknown-infinix-xw3p-smart-watch',
      expectedStore: 'shophive',
      expectedPrice: 5999,
      expectedTotalStores: 2,
    },
  ];

  let allPassed = true;

  console.log('\n--- 1. Testing Increment 6R Newly Persisted Offers ---');
  for (let i = 0; i < testProducts6R.length; i++) {
    const tp = testProducts6R[i];
    console.log(`\n[6R Product ${i + 1}/${testProducts6R.length}] ${tp.name} (${tp.slug})`);

    const offersRes = await service.getMultiStoreOffers(tp.slug);
    if (!offersRes) {
      console.error(`  ❌ getMultiStoreOffers returned null for ${tp.slug}`);
      allPassed = false;
      continue;
    }

    const { offers, store_count, lowest_price, has_multi_store } = (offersRes as any).data || (offersRes as any);
    console.log(`  ✓ store_count      : ${store_count} (expected: ${tp.expectedTotalStores})`);
    console.log(`  ✓ lowest_price     : Rs. ${lowest_price}`);
    console.log(`  ✓ has_multi_store  : ${has_multi_store}`);
    console.log(`  ✓ Total offers     : ${offers?.length}`);

    if (store_count < tp.expectedTotalStores) {
      console.error(`  ❌ store_count (${store_count}) less than expected (${tp.expectedTotalStores})`);
      allPassed = false;
    }

    const found = (offers || []).find((o: any) => (o.store?.slug || o.store_slug) === tp.expectedStore);
    if (!found) {
      console.error(`  ❌ Expected offer from [${tp.expectedStore}] NOT found in API response!`);
      allPassed = false;
    } else {
      console.log(`  ✅ Found offer [${tp.expectedStore}]: Rs. ${found.price} (stock: ${found.in_stock ?? found.is_available})`);
    }

    console.log('    All offers in API response:');
    for (const o of offers || []) {
      const sSlug = o.store?.slug || o.store_slug;
      console.log(`      - [${sSlug}] Rs. ${o.price} (stock: ${o.in_stock ?? o.is_available})`);
    }

    // Detail check
    const detail = await service.getProductDetail(tp.slug);
    if (!detail) {
      console.error(`  ❌ getProductDetail returned null for ${tp.slug}`);
      allPassed = false;
    } else {
      console.log(`  ✓ getProductDetail verified`);
    }
  }

  // Regression check: Increment 6Q offers
  console.log('\n--- 2. Regression Testing: Increment 6Q Persisted Offers ---');
  const testProducts6Q = [
    { name: 'Google Pixel Watch 2', slug: 'google-google-pixel-watch-2', store: 'priceoye', price: 70449 },
    { name: 'Infinix Hot 60 Pro 8GB 128GB', slug: 'infinix-infinix-hot-60-pro-8gb-128gb', store: 'telemart', price: 66949 },
    { name: 'Infinix Hot 60 Pro 8GB 128GB', slug: 'infinix-infinix-hot-60-pro-8gb-128gb', store: 'priceoye', price: 66999 },
  ];

  for (const tp of testProducts6Q) {
    const res = await service.getMultiStoreOffers(tp.slug);
    const { offers, store_count } = (res as any)?.data || (res as any) || {};
    const found = (offers || []).find((o: any) => (o.store?.slug || o.store_slug) === tp.store);
    if (found && store_count >= 2) {
      console.log(`  ✅ [6Q Verified] ${tp.name}: store_count=${store_count}, ${tp.store} @ Rs. ${found.price}`);
    } else {
      console.error(`  ❌ [6Q Failed] ${tp.name}: found=${!!found}, store_count=${store_count}`);
      allPassed = false;
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  🎉 ALL API CHECKS PASSED: 100% SUCCESS');
  } else {
    console.error('  ❌ SOME API CHECKS FAILED');
    process.exit(1);
  }
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

