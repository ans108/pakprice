import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('=== EXACT DATABASE COUNTS AUDIT ===\n');

  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCount } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  const { count: historyCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  const { count: identifierCount } = await supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true });

  console.log(`products:                  ${productCount}`);
  console.log(`product_variants:          ${variantCount}`);
  console.log(`prices:                    ${priceCount}`);
  console.log(`price_history:             ${historyCount}`);
  console.log(`store_product_identifiers: ${identifierCount}\n`);

  // Breakdown per store
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  console.log('=== PER-STORE BREAKDOWN ===');

  for (const s of stores || []) {
    const { count: pCount } = await supabase.from('prices').select('*', { count: 'exact', head: true }).eq('store_id', s.id);
    const { count: hCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true }).eq('store_id', s.id);
    const { count: iCount } = await supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }).eq('store_id', s.id);
    console.log(`Store: ${s.slug.padEnd(12)} | prices: ${String(pCount).padStart(4)} | price_history: ${String(hCount).padStart(4)} | identifiers: ${String(iCount).padStart(4)}`);
  }

  // Investigate Telemart specifically
  const telemartStore = (stores || []).find(s => s.slug === 'telemart');
  if (telemartStore) {
    const { data: tmPrices } = await supabase.from('prices').select('id, variant_id, price').eq('store_id', telemartStore.id);
    const { data: tmIdents } = await supabase.from('store_product_identifiers').select('id, variant_id, identifier').eq('store_id', telemartStore.id);
    const { data: tmHist } = await supabase.from('price_history').select('id, variant_id, price').eq('store_id', telemartStore.id);

    console.log('\n=== TELEMART DETAILED INSPECTION ===');
    console.log(`Telemart prices rows:                 ${tmPrices?.length}`);
    console.log(`Telemart unique variant_ids in prices: ${new Set(tmPrices?.map(p => p.variant_id)).size}`);
    console.log(`Telemart identifier rows:             ${tmIdents?.length}`);
    console.log(`Telemart unique identifiers:          ${new Set(tmIdents?.map(i => i.identifier)).size}`);
    console.log(`Telemart price_history rows:          ${tmHist?.length}`);

    // Check how many of these variants belong to products that have only Telemart vs multiple stores
    const variantIds = (tmPrices || []).map(p => p.variant_id);
    const { data: varData } = await supabase.from('product_variants').select('id, product_id').in('id', variantIds);
    const prodIds = new Set(varData?.map(v => v.product_id));
    console.log(`Distinct products linked to Telemart variants: ${prodIds.size}`);
  }
}

main().catch(console.error);
