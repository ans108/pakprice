import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map<string, string>();
  for (const s of stores || []) storeMap.set(s.id, s.slug);

  const { data: products } = await supabase.from('products').select('id, name, created_at').order('created_at', { ascending: true }).limit(1000);
  const { data: variants } = await supabase.from('product_variants').select('id, product_id, created_at').limit(1000);
  const { data: prices } = await supabase.from('prices').select('id, variant_id, store_id, created_at').limit(1000);

  const varMap = new Map<string, string>();
  for (const v of variants || []) varMap.set(v.id, v.product_id);

  // Group prices by product_id
  const prodPrices = new Map<string, any[]>();
  for (const p of prices || []) {
    const prodId = varMap.get(p.variant_id);
    if (prodId) {
      if (!prodPrices.has(prodId)) prodPrices.set(prodId, []);
      prodPrices.get(prodId)!.push(p);
    }
  }

  const post6BProducts = (products || []).filter(p => new Date(p.created_at) >= new Date('2026-09-21T00:00:00Z'));
  console.log(`Total 6B Products: ${post6BProducts.length}`);

  // Breakdown of stores associated with 6B products
  const storeNewProdCounts: Record<string, number> = {};
  for (const p of post6BProducts) {
    const prs = prodPrices.get(p.id) || [];
    const storeSlugs = Array.from(new Set(prs.map(pr => storeMap.get(pr.store_id) || 'unknown')));
    const key = storeSlugs.sort().join('+') || 'NO_PRICE';
    storeNewProdCounts[key] = (storeNewProdCounts[key] || 0) + 1;
  }

  console.log('Stores associated with newly created 6B products:');
  console.table(storeNewProdCounts);
}

main().catch(console.error);
