import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6T — DATABASE AUDIT RECONCILIATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCount } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  const { count: histCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  const { count: identCount } = await supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true });

  // Check duplicate (variant_id, store_id)
  const { data: allPrices } = await supabase.from('prices').select('id, variant_id, store_id, product_variants!inner(product_id)');

  const pairCount = new Map<string, number>();
  let duplicates = 0;
  const prodStores = new Map<string, Set<string>>();

  for (const p of (allPrices as any[]) || []) {
    const key = `${p.variant_id}:${p.store_id}`;
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
    if (pairCount.get(key)! > 1) duplicates++;

    const prodId = p.product_variants?.product_id;
    if (prodId) {
      if (!prodStores.has(prodId)) prodStores.set(prodId, new Set());
      prodStores.get(prodId)!.add(p.store_id);
    }
  }

  const distribution = {
    zero: 0,
    one: 0,
    two: 0,
    three: 0,
    fourPlus: 0,
  };

  const { data: allProducts } = await supabase.from('products').select('id');
  for (const prod of allProducts || []) {
    const storeCount = prodStores.get(prod.id)?.size || 0;
    if (storeCount === 0) distribution.zero++;
    else if (storeCount === 1) distribution.one++;
    else if (storeCount === 2) distribution.two++;
    else if (storeCount === 3) distribution.three++;
    else distribution.fourPlus++;
  }

  const multiStoreCount = distribution.two + distribution.three + distribution.fourPlus;
  const multiStorePct = ((multiStoreCount / (prodCount || 1)) * 100).toFixed(2);

  console.log(`Canonical Products    : ${prodCount} (Expected 822)`);
  console.log(`Product Variants      : ${varCount} (Expected 822)`);
  console.log(`Active Prices (offers): ${priceCount}`);
  console.log(`Price History Records : ${histCount}`);
  console.log(`Store Identifiers     : ${identCount}`);
  console.log(`Duplicate (v_id, s_id): ${duplicates} (Expected 0)`);
  console.log(`\nProduct Distribution:`);
  console.log(`  - 0 offers : ${distribution.zero}`);
  console.log(`  - 1 offer  : ${distribution.one}`);
  console.log(`  - 2 offers : ${distribution.two}`);
  console.log(`  - 3 offers : ${distribution.three}`);
  console.log(`  - 4+ offers: ${distribution.fourPlus}`);
  console.log(`\nMulti-Store Coverage: ${multiStoreCount} / ${prodCount} (${multiStorePct}%)`);
  console.log(`Goal (>= 41 / 822, >= 5.0%): ${multiStoreCount >= 41 ? '✅ MET AND EXCEEDED!' : '❌ NOT MET'}\n`);

  const report = {
    timestamp: new Date().toISOString(),
    prodCount,
    varCount,
    priceCount,
    histCount,
    identCount,
    duplicates,
    distribution,
    multiStoreCount,
    multiStorePct: `${multiStorePct}%`,
    targetMet: multiStoreCount >= 41,
  };

  fs.writeFileSync(path.resolve(process.cwd(), 'scripts/backfill_report_6t_final.json'), JSON.stringify(report, null, 2));
}

main().catch(console.error);

