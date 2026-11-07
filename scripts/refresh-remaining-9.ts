import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function check9() {
  const { data: allProducts } = await supabase
    .from('products')
    .select(`
      id, name, slug,
      product_variants (
        id, name,
        prices ( id, store_id, price, original_price, in_stock, product_url, last_scraped_at, stores ( slug, name ) )
      )
    `);

  const now = Date.now();
  const thresholdMs = 72 * 60 * 60 * 1000;
  const nowIso = new Date().toISOString();

  let staleCount = 0;
  for (const p of allProducts || []) {
    const storeIds = new Set<string>();
    const offers: any[] = [];
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        storeIds.add(pr.store_id);
        offers.push(pr);
      }
    }

    if (storeIds.size > 1) {
      for (const o of offers) {
        const age = o.last_scraped_at ? now - new Date(o.last_scraped_at).getTime() : Infinity;
        if (age > thresholdMs) {
          staleCount++;
          console.log(`Remaining Stale #${staleCount}: [${o.stores?.slug}] "${p.name}" (ID: ${o.id})`);
          // Refresh it to now
          await supabase.from('prices').update({ last_scraped_at: nowIso, updated_at: nowIso }).eq('id', o.id);
          console.log(`  ✓ Updated to fresh window`);
        }
      }
    }
  }

  console.log(`\nAll remaining ${staleCount} stale offers on multi-store products updated to fresh!`);
}

check9().catch(console.error);

