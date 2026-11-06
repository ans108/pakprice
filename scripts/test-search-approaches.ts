import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function testApproaches() {
  console.log('Testing search query patterns on PostgREST...\n');

  // Test 1: Search products where variant has 64gb
  const q = 'Infinix Smart 20 64GB';
  console.log('--- Test 1: Token-based decomposition for "Infinix Smart 20 64GB" ---');
  // If we extract base product terms ('infinix', 'smart 20') vs spec terms ('64gb')
  const { data: p1 } = await db
    .from('products')
    .select(`
      id, name, slug, normalized_name,
      variants:product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( price, store_id, in_stock )
      )
    `)
    .or('name.ilike.%infinix smart 20%,normalized_name.ilike.%infinix smart 20%');

  console.log(`Found ${p1?.length} products matching base term "infinix smart 20":`);
  p1?.forEach(p => {
    console.log(`- "${p.name}" (Slug: ${p.slug})`);
    p.variants?.forEach((v: any) => {
      console.log(`    Variant: "${v.name}", ram: ${v.ram_gb}GB, storage: ${v.storage_gb}GB`);
    });
  });

  // Test 2: Can we filter by variants in PostgREST?
  console.log('\n--- Test 2: Testing PostgREST inner join on variants ---');
  // PostgREST allows "!inner" to filter parent rows by child criteria
  const { data: p2, error: e2 } = await db
    .from('products')
    .select(`
      id, name,
      variants:product_variants!inner (
        id, name, storage_gb
      )
    `)
    .eq('variants.storage_gb', 64)
    .limit(5);

  if (e2) {
    console.log('PostgREST !inner error:', e2.message);
  } else {
    console.log(`Found ${p2?.length} products with 64GB variant using !inner.`);
    p2?.forEach(p => console.log(`  - ${p.name}`));
  }

  // Test 3: Trigram search vs ilike
  console.log('\n--- Test 3: Trigram search speed ---');
  const t0 = performance.now();
  const { data: p3 } = await db
    .from('products')
    .select('id, name')
    .textSearch('name', 'iPhone 17', { type: 'websearch' })
    .limit(5);
  const d3 = performance.now() - t0;
  console.log(`textSearch latency: ${d3.toFixed(1)}ms, results: ${p3?.length}`);
}

testApproaches().catch(console.error);
