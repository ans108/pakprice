/**
 * Reconcile Audit Items (Category Distribution & Audionic Price History)
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  RECONCILING AUDIT ITEMS: CATEGORIES & AUDIONIC PRICE HISTORY');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. Fetch all products and group multi-store counts by category
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select(`
      id, name, slug, category_id,
      categories ( id, name, slug ),
      product_variants (
        id,
        prices (
          id, store_id, price,
          stores ( id, slug, name )
        )
      )
    `);

  if (pErr) {
    console.error('Error querying products:', pErr);
    process.exit(1);
  }

  const multiStoreByCategory: Record<string, { count: number; products: Array<{ name: string; stores: string[] }> }> = {};
  let totalMulti = 0;

  for (const p of prods || []) {
    const storeSlugs = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of (v as any).prices || []) {
        if (pr.stores?.slug) {
          storeSlugs.add(pr.stores.slug);
        }
      }
    }

    if (storeSlugs.size >= 2) {
      totalMulti++;
      const catSlug = (p.categories as any)?.slug || 'uncategorized';
      if (!multiStoreByCategory[catSlug]) {
        multiStoreByCategory[catSlug] = { count: 0, products: [] };
      }
      multiStoreByCategory[catSlug].count++;
      multiStoreByCategory[catSlug].products.push({
        name: p.name,
        stores: Array.from(storeSlugs),
      });
    }
  }

  console.log(`\n1. MULTI-STORE PRODUCTS BY CATEGORY (Total: ${totalMulti} / 822):`);
  for (const [cat, data] of Object.entries(multiStoreByCategory)) {
    console.log(`   - ${cat.padEnd(25)} : ${data.count} products`);
  }

  // 2. Fetch Audionic Spark Pro S-200 price history
  console.log('\n2. AUDIONIC SPARK PRO S-200 PRICE & HISTORY:');
  const { data: audionic, error: aErr } = await supabase
    .from('products')
    .select(`
      id, name, slug,
      product_variants (
        id, name,
        prices (
          id, store_id, price, original_price, in_stock, source_url, last_scraped_at,
          stores ( slug, name ),
          price_history ( id, price, recorded_at )
        )
      )
    `)
    .ilike('slug', '%spark-pro-s-200%')
    .single();

  if (aErr) {
    console.error('Error querying Audionic:', aErr);
  } else {
    console.log(`   Product: ${audionic.name} (${audionic.slug})`);
    for (const v of audionic.product_variants || []) {
      for (const pr of (v as any).prices || []) {
        console.log(`   Store [${pr.stores?.slug}]: Current Price = Rs. ${pr.price}`);
        console.log(`     URL: ${pr.source_url}`);
        console.log(`     History Entries (${pr.price_history?.length || 0}):`);
        for (const h of pr.price_history || []) {
          console.log(`       - Rs. ${h.price} @ ${h.recorded_at}`);
        }
      }
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
}

main().catch(console.error);

