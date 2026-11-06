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
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s: any) => [s.id, s.slug]));

  // Selected 20 target Telemart-only products representing Pakistani consumer electronics
  const targetProductIds = [
    '6a003dd8-207f-4341-bac4-f06e2e444e3e', // Samsung Galaxy Watch Ultra SM-L705F
    '62f6052f-d083-4d55-9550-1d1fb2337526', // Samsung Galaxy Watch 9 40mm Smartwatch
    'fecb2495-22c1-4e6a-9ce9-b97677e8b14b', // Samsung Galaxy Watch 7 44mm (R-L310)
    'a31f7244-387b-4ea4-aad3-052bcdb3360d', // Apple MacBook Neo 13 Inch 8GB 256GB
    '8ae7564a-d6e1-4794-b294-1aedc283b108', // Apple MacBook Neo 13 Inch 8GB 512GB Touch
    '8988c02f-aefb-4c97-a36a-cb3c3b73e310', // HP ProBook 450 G9 Intel Core i5
    'cbff4070-5fa3-43f9-ba54-52d6811252d6', // HP ProBook 450 G9 Intel Core i7
    'c2ae77bb-c715-46f4-a093-68d1f2b4ffca', // Dell Latitude 3540 Intel Core i5
    '1e41f172-8818-49ee-b6f7-062e212dbd1e', // Dell Latitude 3530 12th Gen Intel Core i5
    'ecf5bac7-4cc5-460e-9520-6c76ca8a5144', // HP 15s Celeron 4GB RAM 500GB HDD
    '53028735-9453-433e-8b9a-e524c7bbbf35', // HP 15-FQ5099TU Intel Core i7-1255U
    '7815a42b-4c3b-4491-afd6-cad6ed2b3b30', // HP 15s-FQ2653TU Intel Core i7-1165G7
    'a636916e-6280-4140-9ab3-979074386a53', // HP Omen Max 16-AH0097NR
    'b9640cc2-d93f-44e6-bea7-4b53d467d055', // Lenovo ThinkPad T14s Gen 6
    '4498ceca-17cc-452e-9373-0f92960aa98e', // Lenovo ThinkPad X9-14 Gen 1
    '39786765-d075-4aad-b804-2d1285d5e236', // Asus Vivobook X1404VAP
    'ba3a9c43-6d01-407a-b66b-befbf3a9a51e', // HP Laptop 15-FD0532NIA
    '6475b071-f3d2-47e2-8b03-158f0f4338d5', // HP Laptop 15-FD0531NIA
    'b5b28ca5-d60c-43c9-8b3f-5af3e484e24b', // Asus Vivobook S 15 K5507QA-MA048W
    '07961906-dfc0-42c8-aa37-0c046890b37e', // Asus Vivobook S 14 K5406SA-PP075W
  ];

  const pilotProducts: any[] = [];
  for (const pid of targetProductIds) {
    const { data: p } = await supabase
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
      .eq('id', pid)
      .single();

    if (p) {
      pilotProducts.push({
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
    }
  }

  fs.writeFileSync('scripts/pilot-20-telemart-electronics.json', JSON.stringify(pilotProducts, null, 2));
  console.log(`Generated pilot-20-telemart-electronics.json with ${pilotProducts.length} verified products.`);
}

main().catch(console.error);
