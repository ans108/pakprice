import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function reconcileHistory() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  RECONCILING PRICE HISTORY SNAPSHOTS IN INCREMENT 6G');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Baseline was 967 history rows, final is 1061 (+94 rows)
  // Current prices grew 736 -> 818 (+82 prices)
  // Let's inspect all price_history rows ordered by recorded_at or created_at
  const { data: allHistory, error } = await db
    .from('price_history')
    .select('id, variant_id, store_id, price, scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(120);

  if (error) throw error;

  console.log(`Fetched recent ${allHistory?.length} price history rows.`);

  const { data: stores } = await db.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  // Count history by store in recent rows
  const storeHistCounts: Record<string, number> = {};
  for (const h of allHistory || []) {
    const slug = storeMap.get(h.store_id) || 'unknown';
    storeHistCounts[slug] = (storeHistCounts[slug] || 0) + 1;
  }
  console.log('Recent history rows by store:', storeHistCounts);

  // Check which variant_id, store_id pairs have multiple history rows in 6G
  const pairCounts = new Map<string, any[]>();
  for (const h of allHistory || []) {
    const key = `${h.variant_id}::${h.store_id}`;
    if (!pairCounts.has(key)) pairCounts.set(key, []);
    pairCounts.get(key)!.push(h);
  }

  const multiHistoryPairs = Array.from(pairCounts.entries()).filter(([_, rows]) => rows.length > 1);
  console.log(`\nPairs with multiple history rows in recent batch: ${multiHistoryPairs.length}`);
  for (const [key, rows] of multiHistoryPairs) {
    const storeSlug = storeMap.get(rows[0].store_id);
    console.log(`- Pair [${storeSlug}] ${rows[0].variant_id}: ${rows.length} snapshots`);
    for (const r of rows) {
      console.log(`    price=${r.price}, scraped_at=${r.scraped_at}`);
    }
  }
}

reconcileHistory().catch(console.error);
