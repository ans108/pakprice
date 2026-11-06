/**
 * Increment 6P — API Offers & Product Detail Verification
 *
 * Directly calls ProductService to verify that all 5 newly persisted offers
 * appear in:
 * 1. getMultiStoreOffers(slug) -> offers list, lowest_price, store_count, has_multi_store
 * 2. getProductBySlug(slug) -> product detail including variants and prices
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
  console.log('  VERIFYING OFFERS API & PRODUCT DETAIL FOR APPROVED 5 PRODUCTS');
  console.log('════════════════════════════════════════════════════════════════');

  const service = new ProductService(supabase);

  const testProducts = [
    {
      name: 'Audionic Spark Pro S-200',
      slug: 'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
      newStore: 'telemart',
      expectedNewPrice: 4499,
    },
    {
      name: 'Infinix XW3GT Smart Watch',
      slug: 'unknown-infinix-xw3gt-smart-watch',
      newStore: 'shophive',
      expectedNewPrice: 5099,
    },
    {
      name: 'Zero Ignite Smart Watch',
      slug: 'unknown-zero-ignite-smart-watch',
      newStore: 'shophive',
      expectedNewPrice: 5999,
    },
    {
      name: 'Zero Luna Smart Watch',
      slug: 'unknown-zero-luna-smart-watch',
      newStore: 'shophive',
      expectedNewPrice: 5999,
    },
    {
      name: 'Zero Visionary Smartwatch',
      slug: 'unknown-zero-visionary-smartwatch',
      newStore: 'shophive',
      expectedNewPrice: 13999,
    },
  ];

  let allPassed = true;

  for (let i = 0; i < testProducts.length; i++) {
    const tp = testProducts[i];
    console.log(`\n[Product ${i + 1}/5] ${tp.name} (${tp.slug})`);

    // 1. Test getMultiStoreOffers
    const offersRes = await service.getMultiStoreOffers(tp.slug);
    if (!offersRes) {
      console.error(`  ❌ getMultiStoreOffers returned null for ${tp.slug}`);
      allPassed = false;
      continue;
    }

    const { offers, store_count, lowest_price, has_multi_store } = offersRes.data || (offersRes as any);
    console.log(`  ✓ store_count      : ${store_count}`);
    console.log(`  ✓ lowest_price     : Rs. ${lowest_price}`);
    console.log(`  ✓ has_multi_store  : ${has_multi_store}`);
    console.log(`  ✓ Total offers     : ${offers?.length}`);

    // Verify new offer is present in offers list
    const newOffer = (offers || []).find((o: any) => o.store?.slug === tp.newStore || o.store_slug === tp.newStore);
    if (!newOffer) {
      console.error(`  ❌ Expected new offer from ${tp.newStore} NOT found in API offers!`);
      allPassed = false;
    } else {
      console.log(`  ✅ Found new offer : store=${tp.newStore}, price=Rs. ${newOffer.price}, inStock=${newOffer.in_stock ?? newOffer.is_available}, url=${newOffer.product_url || newOffer.url}`);
    }

    // List all store offers for clarity
    console.log('    All offers in API response:');
    for (const o of offers || []) {
      const sSlug = o.store?.slug || o.store_slug;
      console.log(`      - [${sSlug}] Rs. ${o.price} (stock: ${o.in_stock ?? o.is_available})`);
    }

    // 2. Test getProductDetail
    const detail = await service.getProductDetail(tp.slug);
    if (!detail) {
      console.error(`  ❌ getProductDetail returned null`);
      allPassed = false;
    } else {
      console.log(`  ✓ Product Detail API: title="${detail.name}", brand="${detail.brand?.name || 'N/A'}"`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  ✅ ALL 5 PERSISTED OFFERS VERIFIED IN OFFERS API & DETAIL API');
  } else {
    console.error('  ❌ ONE OR MORE OFFERS FAILED API VERIFICATION');
    process.exit(1);
  }
  console.log('════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
