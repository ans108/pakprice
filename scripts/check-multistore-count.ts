import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const { data: prices, error } = await supabase
    .from('prices')
    .select('store_id, product_variants!inner(product_id)');

  if (error) {
    console.error('Error fetching prices:', error);
    return;
  }

  const prodStores = new Map<string, Set<string>>();
  for (const p of prices || []) {
    const prodId = (p as any).product_variants?.product_id;
    if (!prodId) continue;
    if (!prodStores.has(prodId)) prodStores.set(prodId, new Set());
    prodStores.get(prodId)!.add(p.store_id);
  }

  let multi = 0;
  for (const s of prodStores.values()) {
    if (s.size > 1) multi++;
  }

  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

  console.log(`Products: ${prodCount}`);
  console.log(`Variants: ${varCount}`);
  console.log(`Multi-Store Products: ${multi} / ${prodCount} (${((multi / (prodCount || 1)) * 100).toFixed(2)}%)`);
}

main().catch(console.error);

