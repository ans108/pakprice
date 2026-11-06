import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('=== Inspecting exact catalog products for user test cases ===\n');

  // 1. All products with 'Smart 20'
  console.log('--- Smart 20 products ---');
  const { data: smart20 } = await db
    .from('products')
    .select(`
      id, name, slug, normalized_name,
      variants:product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( price, store_id, in_stock )
      )
    `)
    .ilike('name', '%Smart 20%');
  smart20?.forEach(p => {
    console.log(`Product: "${p.name}" (slug: ${p.slug})`);
    p.variants?.forEach((v: any) => {
      console.log(`  Variant: "${v.name}", ram: ${v.ram_gb}, storage: ${v.storage_gb}, stores: ${v.prices?.length}`);
    });
  });

  // 2. All Infinix products with 64GB
  console.log('\n--- Infinix 64GB products ---');
  const { data: infinix64 } = await db
    .from('products')
    .select(`
      id, name, slug, normalized_name,
      variants:product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( price, store_id, in_stock )
      )
    `)
    .ilike('name', '%Infinix%');
  infinix64?.forEach(p => {
    const has64 = p.name.includes('64') || p.variants?.some((v: any) => v.storage_gb === 64 || v.name?.includes('64'));
    if (has64) {
      console.log(`Product: "${p.name}" (slug: ${p.slug})`);
      p.variants?.forEach((v: any) => {
        console.log(`  Variant: "${v.name}", ram: ${v.ram_gb}, storage: ${v.storage_gb}, stores: ${v.prices?.length}`);
      });
    }
  });

  // 3. Check products with ram / storage variants across entire catalog
  const { count: ramCount } = await db
    .from('product_variants')
    .select('id', { count: 'exact', head: true })
    .not('ram_gb', 'is', null);

  const { count: storageCount } = await db
    .from('product_variants')
    .select('id', { count: 'exact', head: true })
    .not('storage_gb', 'is', null);

  console.log(`\nVariants with ram_gb != null: ${ramCount}`);
  console.log(`Variants with storage_gb != null: ${storageCount}`);

  console.log('\n--- Common search word candidate counts ---');
  const words = ['phone', 'samsung', 'apple', 'watch', 'pro', 'max', 'band', 'laptop', 'infinix', 'redmi', 'xiaomi', 'cover', 'strap'];
  for (const w of words) {
    const { count } = await db.from('products').select('id', { count: 'exact', head: true }).or(`name.ilike.%${w}%,normalized_name.ilike.%${w}%`);
    console.log(`${w}: ${count} matches`);
  }
}

inspect().catch(console.error);
