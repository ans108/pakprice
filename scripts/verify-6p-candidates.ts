/**
 * Increment 6P Candidate Verification Script
 * Validates each of the 6 proposed matches against Supabase database.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const candidates = [
  {
    num: 1,
    productId: '230f9f5d-0b00-421f-bcdd-a4e83a50b878',
    productName: 'Samsung Galaxy Watch 8 40mm',
    candidateTitle: 'Samsung Galaxy Watch 8 44MM - Wifi',
    store: 'shophive',
    url: 'https://www.shophive.com/samsung-galaxy-watch-8-44mm-wifi/',
    price: 64499,
    method: 'fuzzy (0.814)'
  },
  {
    num: 2,
    productId: '7f59f97f-fced-4d9f-901c-4c32dd8f988f',
    productName: 'Audionic Spark Pro S-200 powerbank 20000 mAh',
    candidateTitle: 'Audionic Spark Pro S-200 Power Bank 20000mAh',
    store: 'telemart',
    url: 'https://www.telemart.pk/products/audionic-spark-pro-s-200-power-bank-20000mah?_pos=1&_psq=Audionic+Spark+Pro+S-200&_psid=d76c63e4a&_ss=e',
    price: 4499,
    method: 'fuzzy (0.930)'
  },
  {
    num: 3,
    productId: '688d4a7f-a7b5-43b9-888e-a733cc3cdd20',
    productName: 'Infinix XW3GT Smart Watch',
    candidateTitle: 'Infinix XW3GT Smart Watch',
    store: 'shophive',
    url: 'https://www.shophive.com/infinix-xw3gt-smart-watch/',
    price: 5099,
    method: 'exact_specs (0.90)'
  },
  {
    num: 4,
    productId: 'b3867ed5-8a69-45f2-aadb-320a2c164fbe',
    productName: 'Zero Ignite Smart Watch',
    candidateTitle: 'Zero Ignite Smart Watch',
    store: 'shophive',
    url: 'https://www.shophive.com/zero-ignite-smart-watch/',
    price: 5999,
    method: 'exact_specs (0.90)'
  },
  {
    num: 5,
    productId: '26833456-2495-4e10-9692-4358eac6d8e7',
    productName: 'Zero Luna Smart Watch',
    candidateTitle: 'Zero Luna Smartwatch',
    store: 'shophive',
    url: 'https://www.shophive.com/zero-luna-smartwatch/',
    price: 5999,
    method: 'exact_specs (0.90)'
  },
  {
    num: 6,
    productId: '59185aa6-1fd3-42b6-9b34-6c6decf64609',
    productName: 'Zero Visionary Smartwatch',
    candidateTitle: 'Zero Visionary Smart Watch',
    store: 'shophive',
    url: 'https://www.shophive.com/zero-visionary-smart-watch/',
    price: 13999,
    method: 'exact_specs (0.90)'
  }
];

async function check() {
  for (const c of candidates) {
    console.log('\n======================================================');
    console.log(`CANDIDATE ${c.num}: ${c.productName} (${c.store})`);
    console.log(`  Target Product ID: ${c.productId}`);
    console.log(`  Candidate Title  : ${c.candidateTitle}`);
    console.log(`  Candidate Price  : Rs. ${c.price}`);
    console.log(`  Candidate URL    : ${c.url}`);
    console.log(`  Match Method     : ${c.method}`);

    const { data: prod } = await supabase
      .from('products')
      .select('*, product_variants(*, prices(*, store:stores(*)))')
      .eq('id', c.productId)
      .single();

    if (!prod) {
      console.log('  ❌ Product not found in DB!');
      continue;
    }

    console.log(`  DB Title : ${prod.title}`);
    console.log(`  DB Brand : ${prod.brand}`);
    console.log(`  DB Slug  : ${prod.slug}`);
    console.log(`  DB Cat ID: ${prod.category_id}`);
    console.log(`  Variants : ${prod.product_variants.length}`);

    for (const v of prod.product_variants) {
      console.log(`    Variant ${v.id} (${v.name || 'Default'}): SKU=${v.sku}, Specs=${JSON.stringify(v.specifications)}`);
      console.log(`      Existing Prices (${v.prices.length}):`);
      for (const p of v.prices) {
        console.log(`        - Store: ${p.store?.name} (${p.store?.slug}), Price: Rs. ${p.price}, Available: ${p.is_available}, URL: ${p.url}`);
      }
    }
  }
}

check().catch(console.error);
