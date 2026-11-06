/**
 * Reconcile Audionic Price History
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
  const { data: audionic, error } = await supabase
    .from('products')
    .select(`
      id, name, slug,
      product_variants (
        id, name,
        prices (
          id, store_id, price, original_price, in_stock, product_url, last_scraped_at,
          stores ( slug, name )
        )
      )
    `)
    .eq('slug', 'unknown-audionic-spark-pro-s-200-powerbank-20000-mah')
    .single();

  if (error) {
    console.error('Supabase query error:', error);
    return;
  }
  if (!audionic) {
    console.log('Audionic product not found');
    return;
  }

  console.log(`Product: ${audionic.name} (${audionic.slug})`);

  for (const v of audionic.product_variants || []) {
    for (const pr of (v as any).prices || []) {
      console.log(`\nStore [${pr.stores?.slug}]: Current Price = Rs. ${pr.price}`);
      console.log(`  Price ID: ${pr.id}`);
      console.log(`  Source URL: ${pr.product_url}`);
      console.log(`  In Stock: ${pr.in_stock}`);
      console.log(`  Last Scraped: ${pr.last_scraped_at}`);

      const { data: history } = await supabase
        .from('price_history')
        .select('*')
        .eq('price_id', pr.id)
        .order('recorded_at', { ascending: true });

      console.log(`  Price History (${history?.length || 0} entries):`);
      for (const h of history || []) {
        console.log(`    - Rs. ${h.price} at ${h.recorded_at}`);
      }
    }
  }
}

main().catch(console.error);
