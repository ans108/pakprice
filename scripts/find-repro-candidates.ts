import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function findCandidates() {
  // Let's find products in the database that have only 1 store offer
  // specifically from Telemart or Mega.pk or Shophive that are popular mainstream products
  const { data: products } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      brand_id,
      product_variants (
        id,
        ram_gb,
        storage_gb,
        color,
        model_number,
        prices (
          price,
          product_url,
          stores (name, slug)
        )
      )
    `)
    .or('name.ilike.%Galaxy A15%,name.ilike.%Galaxy A25%,name.ilike.%Galaxy A35%,name.ilike.%Galaxy A55%,name.ilike.%Redmi Note 13%,name.ilike.%Infinix Hot%,name.ilike.%Camon 30%,name.ilike.%iPad%')
    .limit(20);

  console.log('=== CANDIDATES IN DB WITH CURRENT OFFERS ===');
  for (const p of products || []) {
    const stores = p.product_variants.flatMap((v: any) => v.prices.map((pr: any) => `${pr.stores?.name}: Rs. ${pr.price}`));
    console.log(`Product: "${p.name}"`);
    console.log(`  Slug: ${p.slug}`);
    console.log(`  Current Offers: [${stores.join(', ')}]`);
  }
}

findCandidates().catch(console.error);
