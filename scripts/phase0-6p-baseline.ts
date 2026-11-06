/**
 * Phase 0 + Phase 1 — Increment 6P Baseline Audit
 *
 * Reconciles historical baseline figures, establishes current coverage metrics,
 * and identifies the 50-product pilot set for Phase 2.
 *
 * Usage: npx tsx scripts/phase0-6p-baseline.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function sep(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function line(label: string, value: any) {
  console.log(`  ${label.padEnd(44)} ${value}`);
}

async function main() {
  sep('PHASE 0 — DATABASE RECONCILIATION (Increment 6P)');
  console.log(`  Run time: ${new Date().toISOString()}`);

  // ── Core counts ─────────────────────────────────────────────
  const [
    { count: productCount },
    { count: variantCount },
    { count: priceCount },
    { count: historyCount },
    { count: identifierCount },
    { count: storeCount },
    { count: categoryCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
  ]);

  sep('SECTION 1 — CORE TABLE COUNTS');
  console.log('  Historical snapshots for reference:');
  console.log('    Earlier report   : products=729, prices=736, history=967,  identifiers=740');
  console.log('    6O pre-pause     : products=818, prices=845, history=1106, identifiers=849');
  console.log('    6O post-ingest   : products=822, prices=849, history=1118, identifiers=854');
  console.log('  Current live counts:');
  line('Canonical products:', productCount);
  line('Product variants:', variantCount);
  line('Categories:', categoryCount);
  line('Current price records (offers):', priceCount);
  line('Price history snapshots:', historyCount);
  line('Store product identifiers:', identifierCount);
  line('Registered stores:', storeCount);

  // Delta vs 6O post-ingest baseline
  const base = { products: 822, prices: 849, history: 1118, identifiers: 854 };
  sep('SECTION 2 — DELTA vs 6O POST-INGEST BASELINE');
  const fmt = (n: number) => (n >= 0 ? '+' : '') + n;
  line('Δ products  (current - 822):', fmt((productCount ?? 0) - base.products));
  line('Δ prices    (current - 849):', fmt((priceCount ?? 0) - base.prices));
  line('Δ history   (current - 1118):', fmt((historyCount ?? 0) - base.history));
  line('Δ identifiers (current - 854):', fmt((identifierCount ?? 0) - base.identifiers));

  // ── Stores breakdown ─────────────────────────────────────────
  const { data: stores, error: storesErr } = await supabase
    .from('stores')
    .select('id, slug, name, is_active');
  if (storesErr) throw storesErr;
  const storeMap = new Map(stores!.map(s => [s.id, s]));

  sep('SECTION 3 — STORE REGISTRY');
  for (const s of stores!) {
    console.log(`  [${s.is_active ? '✓' : '✗'}] ${s.slug.padEnd(20)} ${s.name}`);
  }

  // ── Categories ─────────────────────────────────────────────────
  const { data: categories } = await supabase
    .from('categories')
    .select('id, slug, name');
  const catMap = new Map((categories ?? []).map(c => [c.id, c]));

  // ── Prices per store ──────────────────────────────────────────
  const { data: prices, error: pricesErr } = await supabase
    .from('prices')
    .select('id, store_id, variant_id, price, in_stock, last_scraped_at, created_at');
  if (pricesErr) throw pricesErr;

  const now = Date.now();
  const pricesByStore: Record<string, { count: number; fresh: number; stale24h: number; stale7d: number }> = {};
  for (const s of stores!) pricesByStore[s.slug] = { count: 0, fresh: 0, stale24h: 0, stale7d: 0 };
  let inStock = 0;
  let outOfStock = 0;

  for (const p of prices!) {
    const s = storeMap.get(p.store_id);
    const slug = s?.slug ?? 'unknown';
    if (!pricesByStore[slug]) pricesByStore[slug] = { count: 0, fresh: 0, stale24h: 0, stale7d: 0 };
    pricesByStore[slug].count++;
    const ageH = (now - new Date(p.last_scraped_at || p.created_at).getTime()) / 3_600_000;
    if (ageH <= 24) pricesByStore[slug].fresh++;
    else pricesByStore[slug].stale24h++;
    if (ageH > 168) pricesByStore[slug].stale7d++;
    if (p.in_stock) inStock++; else outOfStock++;
  }

  sep('SECTION 4 — PRICES BY STORE (freshness)');
  console.log(`  ${'store'.padEnd(22)} ${'total'.padEnd(8)} ${'≤24h'.padEnd(8)} ${'24h-7d'.padEnd(10)} ${'stale>7d'}`);
  for (const [slug, d] of Object.entries(pricesByStore)) {
    if (d.count > 0) {
      const mid = d.stale24h - d.stale7d;
      console.log(`  ${slug.padEnd(22)} ${String(d.count).padEnd(8)} ${String(d.fresh).padEnd(8)} ${String(mid).padEnd(10)} ${d.stale7d}`);
    }
  }
  line('\nIn-stock prices:', inStock);
  line('Out-of-stock prices:', outOfStock);

  // Explain history vs prices delta
  const histDelta = (historyCount ?? 0) - (priceCount ?? 0);
  console.log(`\n  NOTE: history(${historyCount}) - prices(${priceCount}) = ${histDelta}`);
  console.log('  The history table accumulates all past price snapshots; prices holds only');
  console.log('  the current (latest) price per variant per store.');

  // ── Variant → Product mapping ─────────────────────────────────
  const { data: variants, error: vErr } = await supabase
    .from('product_variants')
    .select('id, product_id');
  if (vErr) throw vErr;
  const variantToProduct = new Map(variants!.map(v => [v.id, v.product_id]));

  // ── All products with category join ───────────────────────────
  const { data: allProducts, error: pErr } = await supabase
    .from('products')
    .select('id, slug, name, category_id, brand_id');
  if (pErr) throw pErr;

  // ── Per-product offer sets ────────────────────────────────────
  const productOffers = new Map<string, Set<string>>();
  const productStoreNames = new Map<string, string[]>();
  for (const p of allProducts!) {
    productOffers.set(p.id, new Set());
    productStoreNames.set(p.id, []);
  }
  for (const pr of prices!) {
    const prodId = variantToProduct.get(pr.variant_id);
    if (prodId && productOffers.has(prodId)) {
      productOffers.get(prodId)!.add(pr.store_id);
      const storeName = storeMap.get(pr.store_id)?.slug ?? '?';
      const storeNames = productStoreNames.get(prodId)!;
      if (!storeNames.includes(storeName)) storeNames.push(storeName);
    }
  }

  // Distribution
  const dist: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
  const multiStoreProducts: Array<{ slug: string; name: string; category: string; stores: string[]; storeCount: number }> = [];

  for (const p of allProducts!) {
    const storeSet = productOffers.get(p.id)!;
    const cnt = storeSet.size;
    const catName = catMap.get(p.category_id)?.slug ?? 'uncategorized';
    if (cnt === 0) dist['0']++;
    else if (cnt === 1) dist['1']++;
    else if (cnt === 2) dist['2']++;
    else if (cnt === 3) dist['3']++;
    else dist['4+']++;
    if (cnt >= 2) {
      multiStoreProducts.push({
        slug: p.slug, name: p.name, category: catName,
        stores: productStoreNames.get(p.id) ?? [],
        storeCount: cnt,
      });
    }
  }

  sep('SECTION 5 — OFFER DISTRIBUTION');
  const total = allProducts!.length;
  console.log('  Offers/product  Count   %');
  for (const [k, v] of Object.entries(dist)) {
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${k.padEnd(16)} ${String(v).padEnd(8)} ${pct}%`);
  }
  const covered = total - dist['0'];
  console.log(`\n  Total products    : ${total}`);
  console.log(`  Covered (≥1 offer): ${covered}  (${((covered / total) * 100).toFixed(1)}%)`);
  console.log(`  Multi-store (≥2)  : ${multiStoreProducts.length}  (${((multiStoreProducts.length / total) * 100).toFixed(1)}%)`);

  // ── Coverage by category ──────────────────────────────────────
  sep('SECTION 6 — COVERAGE BY CATEGORY');
  const catStats = new Map<string, { total: number; covered: number; multi: number }>();
  for (const p of allProducts!) {
    const cat = catMap.get(p.category_id)?.slug ?? 'uncategorized';
    if (!catStats.has(cat)) catStats.set(cat, { total: 0, covered: 0, multi: 0 });
    const entry = catStats.get(cat)!;
    entry.total++;
    const cnt = productOffers.get(p.id)!.size;
    if (cnt >= 1) entry.covered++;
    if (cnt >= 2) entry.multi++;
  }
  console.log(`  ${'category'.padEnd(28)} ${'total'.padEnd(8)} ${'covered'.padEnd(10)} ${'multi-store'}`);
  for (const [cat, d] of [...catStats.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${cat.padEnd(28)} ${String(d.total).padEnd(8)} ${String(d.covered).padEnd(10)} ${d.multi}`);
  }

  // ── Multi-store products ──────────────────────────────────────
  sep('SECTION 7 — PRODUCTS WITH 2+ STORES');
  multiStoreProducts.sort((a, b) => b.storeCount - a.storeCount);
  console.log(`  ${'slug'.padEnd(50)} ${'#'.padEnd(4)} ${'stores'}`);
  for (const p of multiStoreProducts) {
    console.log(`  ${p.slug.padEnd(50)} ${String(p.storeCount).padEnd(4)} ${p.stores.join(', ')}`);
  }

  // ── Phase 1 — Select 50-product pilot set ─────────────────────
  sep('PHASE 1 — PILOT CANDIDATE SELECTION (50 tech products)');

  const techSlugs = ['smartphones', 'mobile-phones', 'laptops', 'smartwatches', 'tablets',
    'audio', 'earphones', 'headphones', 'earbuds', 'smart-watches'];

  // Filter products whose category slug matches tech categories
  const techProducts = allProducts!.filter(p => {
    const catSlug = (catMap.get(p.category_id)?.slug ?? '').toLowerCase();
    const catName = (catMap.get(p.category_id)?.name ?? '').toLowerCase();
    return techSlugs.some(tc => catSlug.includes(tc) || catName.includes(tc)) ||
      catSlug.includes('phone') || catSlug.includes('laptop') || catSlug.includes('tablet') ||
      catSlug.includes('watch') || catSlug.includes('audio');
  });

  const oneOffer = techProducts.filter(p => productOffers.get(p.id)!.size === 1);
  const zeroOffer = techProducts.filter(p => productOffers.get(p.id)!.size === 0);
  const multiOffer = techProducts.filter(p => productOffers.get(p.id)!.size >= 2);

  console.log(`  Tech products total : ${techProducts.length}`);
  console.log(`    0 offers          : ${zeroOffer.length}`);
  console.log(`    1 offer (targets) : ${oneOffer.length}`);
  console.log(`    2+ offers         : ${multiOffer.length}`);

  // Prioritize: 1-offer products (best cross-store backfill targets), then 0-offer, then 2+
  const pilot: typeof allProducts = [];
  for (const p of oneOffer.slice(0, 35)) pilot.push(p);
  for (const p of zeroOffer.slice(0, 15)) { if (pilot.length < 50) pilot.push(p); }
  for (const p of multiOffer) { if (pilot.length < 50) pilot.push(p); }

  console.log(`\n  Selected pilot set  : ${pilot.length} products`);
  console.log(`\n  ${'slug'.padEnd(52)} ${'cat'.padEnd(20)} ${'offers'}`);
  for (const p of pilot) {
    const cnt = productOffers.get(p.id)!.size;
    const stores = (productStoreNames.get(p.id) ?? []).join(',');
    const cat = catMap.get(p.category_id)?.slug ?? '?';
    console.log(`  ${p.slug.padEnd(52)} ${cat.padEnd(20)} ${cnt} [${stores}]`);
  }

  // Save pilot list
  const pilotFile = path.resolve(process.cwd(), 'scripts/pilot-50-6p.json');
  const pilotData = pilot.map(p => ({
    slug: p.slug,
    name: p.name,
    category: catMap.get(p.category_id)?.slug ?? 'unknown',
    categoryName: catMap.get(p.category_id)?.name ?? 'Unknown',
    currentOfferCount: productOffers.get(p.id)!.size,
    currentStores: productStoreNames.get(p.id) ?? [],
  }));
  fs.writeFileSync(pilotFile, JSON.stringify(pilotData, null, 2));
  console.log(`\n  ✓ Pilot list saved to: scripts/pilot-50-6p.json`);

  // ── Final summary ─────────────────────────────────────────────
  sep('FINAL SUMMARY');
  console.log(`  Canonical products  : ${productCount}`);
  console.log(`  Active offers       : ${priceCount}`);
  console.log(`  History snapshots   : ${historyCount}`);
  console.log(`  History vs offers Δ : +${(historyCount ?? 0) - (priceCount ?? 0)} (accumulated past snapshots)`);
  console.log(`  Coverage ≥1 store   : ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`);
  console.log(`  Multi-store ≥2      : ${multiStoreProducts.length}/${total} (${((multiStoreProducts.length / total) * 100).toFixed(1)}%)`);
  console.log(`  Pilot set           : ${pilot.length} products`);
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
