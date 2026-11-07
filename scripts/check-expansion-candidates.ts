import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkCandidates() {
  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name, slug ),
      categories ( slug ),
      product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( id, store_id, price, product_url )
      )
    `);

  if (!products) return;

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const singleStoreByCat: Record<string, number> = {};
  let totalSingle = 0;
  let totalMulti = 0;

  for (const p of products) {
    const sIds = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        sIds.add(pr.store_id);
      }
    }
    const catSlug = (p.categories as any)?.slug || 'none';
    if (sIds.size === 1) {
      totalSingle++;
      singleStoreByCat[catSlug] = (singleStoreByCat[catSlug] || 0) + 1;
    } else if (sIds.size > 1) {
      totalMulti++;
    }
  }

  console.log(`Current Multi-store products: ${totalMulti} / ${products.length} (${((totalMulti / products.length) * 100).toFixed(2)}%)`);
  console.log(`Single-store products: ${totalSingle}`);
  console.log('Single-store breakdown by category:');
  for (const [cat, count] of Object.entries(singleStoreByCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(25)}: ${count}`);
  }
}

checkCandidates();

