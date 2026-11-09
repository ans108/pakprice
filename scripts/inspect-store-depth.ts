import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  console.log('Stores in DB:', stores?.map(s => ({ id: s.id, slug: s.slug, name: s.name })));

  const { data: prices } = await supabase
    .from('prices')
    .select('variant_id, store_id, product_variants!inner(product_id)');

  const prodStores = new Map<string, Set<string>>();
  for (const p of (prices as any[]) || []) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    if (!prodStores.has(prodId)) prodStores.set(prodId, new Set());
    prodStores.get(prodId)!.add(p.store_id);
  }

  let c1 = 0, c2 = 0, c3 = 0, c4plus = 0;
  for (const s of prodStores.values()) {
    if (s.size === 1) c1++;
    else if (s.size === 2) c2++;
    else if (s.size === 3) c3++;
    else if (s.size >= 4) c4plus++;
  }

  console.log({
    totalProducts: prodStores.size,
    oneStore: c1,
    twoStores: c2,
    threeStores: c3,
    fourPlusStores: c4plus,
    totalMultiStore: c2 + c3 + c4plus
  });
}

run().catch(console.error);

