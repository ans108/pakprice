import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function check() {
  const { data: p } = await supabase
    .from('products')
    .select(`
      id, name, slug,
      product_variants (
        id, name,
        prices ( id, store_id, price, in_stock, product_url, last_scraped_at, stores(slug, name) )
      )
    `)
    .ilike('name', '%Zero Terra Fit%')
    .single();

  const now = Date.now();
  console.log('Product:', p?.name, p?.slug);
  for (const pr of p?.product_variants?.[0]?.prices || []) {
    const ageHours = pr.last_scraped_at ? (now - new Date(pr.last_scraped_at).getTime()) / 3600000 : null;
    console.log(`- Store: ${pr.stores?.name} (${pr.stores?.slug}) | Price: Rs. ${pr.price} | InStock: ${pr.in_stock} | Age: ${ageHours?.toFixed(1)}h | Fresh: ${ageHours !== null && ageHours <= 72}`);
  }
}

check().catch(console.error);

