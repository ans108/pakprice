import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const current = JSON.parse(fs.readFileSync('scripts/pilot-20-telemart-electronics.json', 'utf8'));
  const currentIds = new Set(current.map((p: any) => p.id));

  const { data: stores } = await supabase.from('stores').select('id, slug');
  const telemartId = stores?.find(s => s.slug === 'telemart')?.id;

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug,
      brands ( name ),
      categories ( name, slug ),
      product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( id, store_id, price, in_stock, product_url, last_scraped_at )
      )
    `)
    .order('created_at', { ascending: false });

  for (const p of products || []) {
    if (current.length >= 20) break;
    if (currentIds.has(p.id)) continue;

    const allPrices = p.product_variants?.flatMap((v: any) => v.prices || []) || [];
    const storeIds = new Set(allPrices.map((pr: any) => pr.store_id));

    if (storeIds.size === 1 && storeIds.has(telemartId)) {
      current.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: (p.brands as any)?.name,
        category: (p.categories as any)?.name,
        categorySlug: (p.categories as any)?.slug,
        variantCount: (p.product_variants || []).length,
        variants: (p.product_variants || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          ram: v.ram_gb,
          storage: v.storage_gb,
          color: v.color,
          model: v.model_number,
          telemartPrice: v.prices?.[0]?.price,
          url: v.prices?.[0]?.product_url,
        })),
      });
      currentIds.add(p.id);
    }
  }

  fs.writeFileSync('scripts/pilot-20-telemart-electronics.json', JSON.stringify(current, null, 2));
  console.log(`Updated pilot-20-telemart-electronics.json to exactly ${current.length} products.`);
}

main().catch(console.error);
