import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function inspectLaptops() {
  const { data: laptops } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name ),
      product_variants (
        id, name, ram_gb, storage_gb, model_number,
        prices ( id, store_id, price, product_url, stores ( slug ) )
      )
    `)
    .eq('category_id', (await supabase.from('categories').select('id').eq('slug', 'laptops').single()).data?.id)
    .order('name');

  console.log(`Total Laptops in DB: ${laptops?.length}`);
  console.log('Sample 10 Laptops:');
  for (const l of (laptops || []).slice(0, 15)) {
    const v = l.product_variants?.[0];
    const store = (v?.prices?.[0]?.stores as any)?.slug;
    console.log(`- "${l.name}" | Brand: ${l.brands?.name} | RAM: ${v?.ram_gb}GB | SSD: ${v?.storage_gb}GB | Store: ${store} | URL: ${v?.prices?.[0]?.product_url}`);
  }
}

inspectLaptops().catch(console.error);

