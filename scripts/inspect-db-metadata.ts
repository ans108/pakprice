import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: categories } = await supabase.from('categories').select('id, name, slug');
  console.log('Categories in DB:');
  for (const c of categories || []) {
    console.log(` - ${c.slug} (${c.name}) [${c.id}]`);
  }

  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  console.log('\nStores in DB:');
  for (const s of stores || []) {
    console.log(` - ${s.slug} (${s.name}) [${s.id}]`);
  }

  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCount } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  console.log(`\nCurrent DB counts: products=${productCount}, variants=${variantCount}, prices=${priceCount}`);
}

run().catch(console.error);

