import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function fullAuditReconciliation() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6G — FULL AUDIT RECONCILIATION SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1. Total counts
  const [
    { count: pCount },
    { count: vCount },
    { count: prCount },
    { count: phCount },
    { count: spiCount },
  ] = await Promise.all([
    db.from('products').select('*', { count: 'exact', head: true }),
    db.from('product_variants').select('*', { count: 'exact', head: true }),
    db.from('prices').select('*', { count: 'exact', head: true }),
    db.from('price_history').select('*', { count: 'exact', head: true }),
    db.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
  ]);

  console.log(`CURRENT DB TOTALS:`);
  console.log(`- Products: ${pCount} (Baseline: 729, Delta: +${(pCount || 0) - 729})`);
  console.log(`- Variants: ${vCount} (Baseline: 729, Delta: +${(vCount || 0) - 729})`);
  console.log(`- Prices: ${prCount} (Baseline: 736, Delta: +${(prCount || 0) - 736})`);
  console.log(`- Price History: ${phCount} (Baseline: 967, Delta: +${(phCount || 0) - 967})`);
  console.log(`- Store Identifiers: ${spiCount} (Baseline: 740, Delta: +${(spiCount || 0) - 740})`);

  // 2. Stores map
  const { data: stores } = await db.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  // 3. Inspect the newest (phCount - 967) = 94 price_history rows
  const delta = (phCount || 0) - 967;
  console.log(`\nAnalyzing the exact ${delta} price history rows inserted during Increment 6G...`);

  const { data: recentHistory } = await db
    .from('price_history')
    .select('id, variant_id, store_id, price, original_price, in_stock, scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(delta);

  const histByStore: Record<string, number> = {};
  for (const h of recentHistory || []) {
    const slug = storeMap.get(h.store_id) || h.store_id;
    histByStore[slug] = (histByStore[slug] || 0) + 1;
  }
  console.log(`History rows by store in 6G (+${delta}):`, histByStore);

  // Group by (variant_id, store_id)
  const pairGroups = new Map<string, any[]>();
  for (const h of recentHistory || []) {
    const key = `${h.variant_id}::${h.store_id}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key)!.push(h);
  }

  console.log(`Unique (variant_id, store_id) pairs in 6G history: ${pairGroups.size}`);
  
  // Find pairs with multiple history rows
  const multiRows = Array.from(pairGroups.entries()).filter(([_, rows]) => rows.length > 1);
  console.log(`Pairs with >1 snapshot in 6G: ${multiRows.length}`);
  for (const [key, rows] of multiRows) {
    const storeSlug = storeMap.get(rows[0].store_id);
    console.log(`\n  Store [${storeSlug}] Variant ${rows[0].variant_id} (${rows.length} snapshots):`);
    for (const r of rows) {
      console.log(`    - Price: ${r.price}, InStock: ${r.in_stock}, ScrapedAt: ${r.scraped_at}`);
    }
  }

  // Check if any history row in 6G belongs to a variant that already had prices before 6G
  const { data: currentPrices } = await db.from('prices').select('variant_id, store_id, price, updated_at');
  console.log(`\nCurrent total prices: ${currentPrices?.length}`);
}

fullAuditReconciliation().catch(console.error);
