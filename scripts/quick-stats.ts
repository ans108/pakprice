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
  const { count: prods, error: errP } = await supabase.from('products').select('id', { count: 'exact', head: true });
  const { count: vars, error: errV } = await supabase.from('product_variants').select('id', { count: 'exact', head: true });
  
  const { data: prices, error: errPr } = await supabase.from('prices').select('variant_id, store_id, product_variants!inner(product_id)');
  if (errPr) {
    console.error('Prices err:', errPr);
    return;
  }

  const prodMap = new Map<string, Set<string>>();
  for (const p of prices || []) {
    const id = (p as any).product_variants?.product_id;
    if (!id) continue;
    if (!prodMap.has(id)) prodMap.set(id, new Set());
    prodMap.get(id)!.add(p.store_id);
  }

  let one = 0, two = 0, three = 0, fourPlus = 0;
  for (const s of prodMap.values()) {
    if (s.size === 1) one++;
    else if (s.size === 2) two++;
    else if (s.size === 3) three++;
    else if (s.size >= 4) fourPlus++;
  }

  console.log({
    totalProducts: prods,
    totalVariants: vars,
    totalActivePrices: prices?.length,
    oneStore: one,
    twoStores: two,
    threeStores: three,
    fourPlusStores: fourPlus,
    threePlusStores: three + fourPlus,
    totalMultiStore: two + three + fourPlus,
  });
}

run().catch(console.error);

