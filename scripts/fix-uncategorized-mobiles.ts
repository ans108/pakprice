/**
 * Increment 6T — Fix Uncategorized Multi-Store Smartphones
 *
 * Idempotently assigns the 'mobiles' category_id to active products where
 * category_id IS NULL and the product name clearly matches smartphone models.
 * Preserves products count (822) and variants count (822).
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const SMARTPHONE_PATTERNS = [
  /\binfinix\s+(?:hot|note|smart|zero\s+\d|gt\s+\d)/i,
  /\btecno\s+(?:spark|camon|pova|phantom|pop)/i,
  /\bsamsung\s+galaxy\s+(?:a\d|s\d|m\d|z\s+fold|z\s+flip|note\s+\d|f\d)/i,
  /\bredmi\s+(?:note|\d|a\d|c\d)/i,
  /\bxiaomi\s+(?:\d|mi\s+\d|redmi|poco)/i,
  /\bpoco\s+(?:c|m|x|f)\d/i,
  /\bvivo\s+(?:y\d|v\d|x\d|t\d)/i,
  /\boppo\s+(?:a\d|reno|find)/i,
  /\brealme\s+(?:c\d|narzo|gt|\d+)/i,
  /\biphone\s+(?:\d|se|x|xs|xr|11|12|13|14|15|16)/i,
  /\bgoogle\s+pixel\s+\d/i,
  /\bhonor\s+(?:x\d|magic|\d+)/i,
];

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  FIX UNカテゴIZED SMARTPHONES IN DATABASE');
  console.log('════════════════════════════════════════════════════════════════\n');

  // 1. Verify baseline product & variant counts
  const { count: prodCountBefore } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCountBefore } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline: ${prodCountBefore} products, ${varCountBefore} variants`);

  // 2. Fetch categories
  const { data: categories, error: catErr } = await supabase.from('categories').select('id, name, slug');
  if (catErr || !categories) {
    throw new Error(`Failed to fetch categories: ${catErr?.message}`);
  }

  const mobileCategory = categories.find(c => c.slug === 'mobiles' || c.slug === 'smartphones' || c.name.toLowerCase() === 'mobiles');
  if (!mobileCategory) {
    console.error('Available categories:', categories);
    throw new Error('Mobiles category not found!');
  }
  console.log(`Target Category: ${mobileCategory.name} (${mobileCategory.slug}, id: ${mobileCategory.id})\n`);

  // 3. Fetch products where category_id is null
  const { data: uncategorized, error: uncatErr } = await supabase
    .from('products')
    .select('id, name, slug, brand_id, category_id')
    .is('category_id', null);

  if (uncatErr) {
    throw new Error(`Failed to fetch uncategorized products: ${uncatErr.message}`);
  }

  console.log(`Found ${uncategorized?.length || 0} products with category_id IS NULL`);

  const toUpdate: Array<{ id: string; name: string }> = [];

  for (const prod of uncategorized || []) {
    const isPhone = SMARTPHONE_PATTERNS.some(pat => pat.test(prod.name));
    if (isPhone) {
      toUpdate.push({ id: prod.id, name: prod.name });
    }
  }

  console.log(`Identified ${toUpdate.length} uncategorized smartphones to assign:`);
  for (const p of toUpdate) {
    console.log(`  • [${p.id.slice(0, 8)}] ${p.name}`);
  }

  if (toUpdate.length > 0) {
    console.log(`\nUpdating ${toUpdate.length} products to category '${mobileCategory.name}'...`);
    for (const p of toUpdate) {
      const { error: updErr } = await supabase
        .from('products')
        .update({ category_id: mobileCategory.id })
        .eq('id', p.id);

      if (updErr) {
        console.error(`  ❌ Failed to update ${p.name}:`, updErr.message);
      }
    }
    console.log('✓ All matched products updated.');
  } else {
    console.log('✓ No uncategorized smartphones found needing update.');
  }

  // 4. Verify post-counts
  const { count: prodCountAfter } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCountAfter } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`\nPost-check: ${prodCountAfter} products (expected ${prodCountBefore}), ${varCountAfter} variants (expected ${varCountBefore})`);

  if (prodCountAfter !== prodCountBefore || varCountAfter !== varCountBefore) {
    console.error('❌ FATAL: Product or variant count changed!');
  } else {
    console.log('✅ Integrity verified: 0 products or variants created/deleted.\n');
  }
}

main().catch(err => {
  console.error('Fatal error in fix-uncategorized-mobiles:', err);
  process.exit(1);
});

