import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const SMALL_BATCH = 50; // Keep URLs short to avoid Supabase URL length limits

async function main() {
  // 1. Resolve Telemart store ID
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const telemartId = (stores as any[])?.find((s) => s.slug === 'telemart')?.id;
  console.log('Telemart store ID:', telemartId);
  if (!telemartId) { console.error('No telemart store found'); return; }

  // 2. Get all Telemart variant_ids from prices (these work fine - it's a simple eq filter)
  const { data: tmPrices, error: e1 } = await supabase
    .from('prices')
    .select('variant_id')
    .eq('store_id', telemartId);
  if (e1) { console.error('prices error:', e1); return; }

  const varIds = [...new Set(((tmPrices as any[]) || []).map((p) => p.variant_id))];
  console.log('Step 1 - Telemart variant_ids from prices:', varIds.length);

  // 3. Resolve variant_id -> product_id in SMALL batches of 50
  const productIdSet = new Set<string>();
  let totalVarRowsReturned = 0;
  for (let i = 0; i < varIds.length; i += SMALL_BATCH) {
    const batch = varIds.slice(i, i + SMALL_BATCH);
    const { data: vars, error } = await supabase
      .from('product_variants')
      .select('id, product_id')
      .in('id', batch);
    if (error) { console.error(`batch ${i} error:`, error); continue; }
    totalVarRowsReturned += (vars || []).length;
    for (const v of (vars as any[]) || []) productIdSet.add(v.product_id);
  }
  const productIds = [...productIdSet];
  console.log('Step 2 - Variant rows returned from DB:', totalVarRowsReturned, '/', varIds.length);
  console.log('Step 2 - Unique product_ids resolved:', productIds.length);

  // 4. Sanity check: are these product_ids actually in the products table?
  let foundInProducts = 0;
  let notFoundInProducts = 0;
  const missingProductIds: string[] = [];
  for (let i = 0; i < productIds.length; i += SMALL_BATCH) {
    const batch = productIds.slice(i, i + SMALL_BATCH);
    const { data: prods } = await supabase
      .from('products')
      .select('id')
      .in('id', batch);
    foundInProducts += (prods || []).length;
    const found = new Set(((prods as any[]) || []).map((p) => p.id));
    for (const pid of batch) {
      if (!found.has(pid)) { notFoundInProducts++; missingProductIds.push(pid); }
    }
  }
  console.log('Step 3 - Product IDs found in products table:', foundInProducts);
  console.log('Step 3 - Product IDs NOT found in products table:', notFoundInProducts);
  if (missingProductIds.length > 0 && missingProductIds.length <= 10) {
    console.log('  Missing IDs:', missingProductIds);
  }

  // 5. Get categories for all resolved product_ids
  const categoryCounts: Record<string, number> = {};
  let withCategory = 0;
  let withoutCategory = 0;
  const uncategorizedSample: string[] = [];

  for (let i = 0; i < productIds.length; i += SMALL_BATCH) {
    const batch = productIds.slice(i, i + SMALL_BATCH);
    const { data: products, error: e2 } = await supabase
      .from('products')
      .select('id, name, category_id, categories(slug, name)')
      .in('id', batch);
    if (e2) { console.error('products error:', e2); continue; }
    for (const p of (products as any[]) || []) {
      const cat = p.categories;
      if (cat && cat.slug) {
        withCategory++;
        const key = `${cat.slug} (${cat.name})`;
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
      } else {
        withoutCategory++;
        if (uncategorizedSample.length < 5) uncategorizedSample.push(p.name || p.id);
      }
    }
  }

  console.log('\n=== TELEMART CATEGORY BREAKDOWN ===');
  console.log('Total unique products (via variant->product join):', productIds.length);
  console.log('With category:', withCategory);
  console.log('Without category (null category_id):', withoutCategory);

  if (uncategorizedSample.length > 0) {
    console.log('Sample uncategorized product names:', uncategorizedSample);
  }

  const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  console.log('\nCategory distribution:');
  for (const [cat, cnt] of sorted) {
    console.log(`  ${cat}: ${cnt}`);
  }

  // 6. Also check overall products table for category coverage
  const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: categorizedProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('category_id', 'is', null);
  console.log('\n=== OVERALL DB PRODUCT CATEGORY COVERAGE ===');
  console.log('Total products in DB:', totalProducts);
  console.log('Products with category_id set:', categorizedProducts);
  console.log('Products without category_id:', (totalProducts || 0) - (categorizedProducts || 0));

  // 7. Check categories table  
  const { data: allCats } = await supabase.from('categories').select('id, slug, name');
  console.log('\nAll categories in DB:');
  for (const c of (allCats as any[]) || []) {
    console.log(`  ${c.slug} (${c.name}) — id: ${c.id}`);
  }

  // 8. Verdict
  const electronicsSlugs = ['mobiles', 'laptops', 'tablets', 'smart-watches', 'earbuds', 'audio', 'electronics', 'iphones', 'smartphones'];
  const electronicsCount = sorted
    .filter(([slug]) => electronicsSlugs.some((e) => slug.toLowerCase().includes(e)))
    .reduce((s, [, c]) => s + c, 0);

  console.log('\n=== VERDICT ===');
  console.log('Telemart products with electronics category:', electronicsCount);
  console.log('Telemart products with any category:', withCategory);
  console.log('PASS (>=100 categorized electronics):', electronicsCount >= 100 ? 'YES - PASS' : 'NO - FAIL');
  console.log('PASS (>=100 with any category):', withCategory >= 100 ? 'YES - PASS' : 'NO - FAIL');
}

main().catch(console.error);
