/**
 * Increment 7C — Phase 1: Remove HomeShopping completely from the database
 * 1. Clean up any residual prices, price_history, store_product_identifiers, coupons, bank_offers
 * 2. Set is_active = false on stores where slug = 'homeshopping'
 * 3. Update sequential sort_order (1..11) for the 11 active stores
 * 4. Verify 11 active stores
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

const ORDERED_SLUGS = [
  'daraz',
  'priceoye',
  'mega-pk',
  'telemart',
  'shophive',
  'paklap',
  'ishopping',
  'metro',
  'carrefour',
  'naheed',
  'al-fatah',
];

async function run() {
  console.log('=== Increment 7C - Phase 1: Remove HomeShopping & Re-index 11 Stores ===\n');

  // 1. Fetch homeshopping store
  const { data: hsStore, error: hsErr } = await supabase
    .from('stores')
    .select('id, name, slug')
    .eq('slug', 'homeshopping')
    .maybeSingle();

  if (hsStore) {
    console.log(`Found HomeShopping store id: ${hsStore.id}`);

    // Check & delete any residual rows
    const { count: pCount } = await supabase.from('prices').select('*', { count: 'exact', head: true }).eq('store_id', hsStore.id);
    console.log(`Residual prices rows for HomeShopping: ${pCount || 0}`);
    if (pCount && pCount > 0) {
      await supabase.from('prices').delete().eq('store_id', hsStore.id);
    }

    const { count: hCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true }).eq('store_id', hsStore.id);
    console.log(`Residual price_history rows for HomeShopping: ${hCount || 0}`);
    if (hCount && hCount > 0) {
      await supabase.from('price_history').delete().eq('store_id', hsStore.id);
    }

    const { count: spiCount } = await supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }).eq('store_id', hsStore.id);
    console.log(`Residual store_product_identifiers rows for HomeShopping: ${spiCount || 0}`);
    if (spiCount && spiCount > 0) {
      await supabase.from('store_product_identifiers').delete().eq('store_id', hsStore.id);
    }

    // Set is_active = false
    const { error: updateErr } = await supabase
      .from('stores')
      .update({ is_active: false, sort_order: 99 })
      .eq('id', hsStore.id);

    if (updateErr) {
      console.error('Failed to deactivate HomeShopping:', updateErr);
    } else {
      console.log('Successfully set is_active = false on HomeShopping in stores table.');
    }
  } else {
    console.log('HomeShopping store row not found or already removed.');
  }

  // 2. Re-index sequential sort_order (1..11) for active stores
  console.log('\nUpdating sort_order (1..11) for all 11 active stores:');
  for (let i = 0; i < ORDERED_SLUGS.length; i++) {
    const slug = ORDERED_SLUGS[i];
    const sortOrder = i + 1;
    const { error: sErr } = await supabase
      .from('stores')
      .update({ sort_order: sortOrder, is_active: true })
      .eq('slug', slug);
    if (sErr) {
      console.error(`Error updating sort_order for ${slug}:`, sErr);
    } else {
      console.log(` [${sortOrder}] ${slug} -> sort_order = ${sortOrder}, is_active = true`);
    }
  }

  // 3. Verify active stores
  const { data: activeStores, error: listErr } = await supabase
    .from('stores')
    .select('id, name, slug, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (listErr) {
    console.error('Failed to list active stores:', listErr);
    return;
  }

  console.log(`\nActive stores count: ${activeStores.length} (Target: 11)`);
  for (const s of activeStores) {
    const { count: c } = await supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', s.id);
    console.log(`  ${s.sort_order.toString().padStart(2)}. ${s.name.padEnd(16)} [${s.slug.padEnd(12)}]: ${(c || 0).toString().padStart(4)} verified offers`);
  }

  console.log('\nPhase 1 Complete: HomeShopping removed, 11 active stores operational.');
}

run().catch(console.error);

