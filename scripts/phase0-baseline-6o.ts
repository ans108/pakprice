import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ScraperRegistry } from '../apps/scraper/src/scrapers/ScraperRegistry';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== PHASE 0 BASELINE AUDIT (6O) ===');
  
  // 1. Stores
  const { data: stores, error: storesErr } = await supabase.from('stores').select('*');
  if (storesErr) throw storesErr;
  console.log(`Registered stores count: ${stores.length}`);
  const storeMap = new Map(stores.map(s => [s.id, s]));

  // 2. Products and Variants
  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Product count: ${productCount}, Variant count: ${variantCount}`);

  // 3. Current Prices / Offers
  const { data: prices, error: pricesErr } = await supabase.from('prices').select('*');
  if (pricesErr) throw pricesErr;
  console.log(`Total current price records: ${prices.length}`);

  // Group by store
  const storeCounts: Record<string, number> = {};
  for (const s of stores) {
    storeCounts[s.slug] = 0;
  }
  for (const p of prices) {
    const s = storeMap.get(p.store_id);
    const slug = s ? s.slug : 'unknown';
    storeCounts[slug] = (storeCounts[slug] || 0) + 1;
  }
  console.log('Prices grouped by store:', storeCounts);

  // Freshness check: consider > 24 hours or > 7 days as stale
  const now = Date.now();
  let fresh24h = 0;
  let stale24h = 0;
  let stale7d = 0;
  for (const p of prices) {
    const scrapedAt = new Date(p.last_scraped_at || p.created_at).getTime();
    const ageHours = (now - scrapedAt) / (1000 * 60 * 60);
    if (ageHours <= 24) fresh24h++;
    else stale24h++;
    if (ageHours > 24 * 7) stale7d++;
  }
  console.log(`Freshness breakdown: <= 24h: ${fresh24h}, > 24h: ${stale24h}, > 7d: ${stale7d}`);

  // Offers per canonical product
  // Variant to product mapping
  const { data: variants, error: vErr } = await supabase.from('product_variants').select('id, product_id');
  if (vErr) throw vErr;
  const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

  // Product to distinct stores with active offers
  const productOffers = new Map<string, Set<string>>();
  // Initialize all products with empty set
  const { data: allProducts, error: pErr } = await supabase.from('products').select('id, slug, name');
  if (pErr) throw pErr;
  for (const p of allProducts) {
    productOffers.set(p.id, new Set());
  }

  for (const pr of prices) {
    const prodId = variantToProduct.get(pr.variant_id);
    if (prodId && productOffers.has(prodId)) {
      productOffers.get(prodId)!.add(pr.store_id);
    }
  }

  const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
  for (const [prodId, storeSet] of productOffers.entries()) {
    const count = storeSet.size;
    if (count === 0) distribution[0]++;
    else if (count === 1) distribution[1]++;
    else if (count === 2) distribution[2]++;
    else if (count === 3) distribution[3]++;
    else distribution['4+']++;
  }
  console.log('Distribution of verified offers per canonical product:', distribution);

  // Registry check
  const supportedStores = ScraperRegistry.getInstance().getSupportedStores();
  console.log(`Active store connectors in ScraperRegistry: ${supportedStores.length}`);
  supportedStores.forEach(slug => {
    const s = ScraperRegistry.getInstance().get(slug);
    console.log(`- ${slug} (${s?.storeName || 'Unknown'})`);
  });
}

main().catch(console.error);
