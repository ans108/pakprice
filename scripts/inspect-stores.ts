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
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map((s) => [s.id, s.slug]));
  const { data: prices } = await supabase
    .from('prices')
    .select('variant_id, store_id, product_variants!inner(product_id, products!inner(name, slug))');
  const prodMap = new Map<string, { name: string; slug: string; stores: string[] }>();
  for (const p of prices || []) {
    const id = (p as any).product_variants.product_id;
    if (!prodMap.has(id)) {
      prodMap.set(id, {
        name: (p as any).product_variants.products.name,
        slug: (p as any).product_variants.products.slug,
        stores: [],
      });
    }
    prodMap.get(id)!.stores.push(storeMap.get(p.store_id) || p.store_id);
  }
  const threePlus = Array.from(prodMap.values()).filter((p) => p.stores.length >= 3);
  console.log(`3+ store products (${threePlus.length}):`);
  threePlus.forEach((p) => console.log(`  ${p.name} -> ${p.stores.join(', ')}`));

  const twoStore = Array.from(prodMap.values()).filter((p) => p.stores.length === 2);
  console.log(`\nSample 2-store products (first 15):`);
  twoStore.slice(0, 15).forEach((p) => console.log(`  ${p.name} -> ${p.stores.join(', ')}`));
}
run();

