/**
 * Increment 7C — 11-Store Verification and Integrity Audit
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log('=================================================================');
  console.log('       INCREMENT 7C FINAL ACCEPTANCE & INTEGRITY AUDIT');
  console.log('=================================================================\n');

  // 1. Total Catalog Counts
  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCount } = await supabase.from('prices').select('*', { count: 'exact', head: true });

  console.log(`Total Products:         ${productCount}`);
  console.log(`Total Product Variants: ${variantCount}`);
  console.log(`Total Verified Prices:  ${priceCount}\n`);

  // 2. Active Stores Audit (Target: Exactly 11 stores)
  const { data: activeStores, error: sErr } = await supabase
    .from('stores')
    .select('id, name, slug, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (sErr || !activeStores) {
    console.error('Failed to query stores:', sErr);
    return;
  }

  console.log('-----------------------------------------------------------------');
  console.log(` 11 ACTIVE MONITORED STORES AUDIT (Count: ${activeStores.length})`);
  console.log('-----------------------------------------------------------------');

  let zeroCountStores = 0;

  for (const s of activeStores) {
    const { count } = await supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', s.id);

    const offerCount = count || 0;
    if (offerCount === 0) zeroCountStores++;

    const statusNote = offerCount >= 60
      ? '✓ (EXCELLENT >= 60)'
      : offerCount > 0
      ? '✓ (ACTIVE)'
      : '✗ (FAILED - 0 OFFERS)';

    console.log(
      `  [${s.sort_order.toString().padStart(2)}] ${s.name.padEnd(16)} [${s.slug.padEnd(12)}]: ${offerCount.toString().padStart(4)} verified offers  ${statusNote}`
    );
  }

  console.log(`\nZero-offer stores among active: ${zeroCountStores} ${zeroCountStores === 0 ? '✓ (PERFECT - 0 STORES WITH 0 OFFERS)' : '✗ (FAILED)'}`);

  // 3. Samsung Galaxy A07 Multi-Variant Check
  console.log('\n-----------------------------------------------------------------');
  console.log(' SAMSUNG GALAXY A07 MULTI-VARIANT APPLES-TO-APPLES AUDIT');
  console.log('-----------------------------------------------------------------');

  const { data: a07Product } = await supabase
    .from('products')
    .select('id, name, slug')
    .eq('slug', 'samsung-samsung-galaxy-a07-dual-sim-with-official-warranty')
    .single();

  if (a07Product) {
    const { data: variants } = await supabase
      .from('product_variants')
      .select(`
        id,
        name,
        ram_gb,
        storage_gb,
        prices (
          id,
          price,
          product_url,
          stores (
            name,
            slug
          )
        )
      `)
      .eq('product_id', a07Product.id)
      .order('created_at', { ascending: true });

    for (const v of variants || []) {
      const pList = (v as any).prices || [];
      console.log(`\n* Configuration: "${v.name}" (${v.ram_gb}GB RAM / ${v.storage_gb}GB Storage) — ${pList.length} offers:`);
      for (const p of pList) {
        console.log(`   - ${p.stores?.name.padEnd(12)}: Rs. ${Number(p.price).toLocaleString()} | URL: ${p.product_url}`);
      }
    }
  }

  console.log('\n=================================================================');
}

run().catch(console.error);

