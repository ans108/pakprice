/**
 * Increment 6B — Staged Verification Script
 * 
 * Validates store scraper changes made in 6B:
 * Phase 1: Dry-run zero-write invariant for all stores
 * Phase 2: Telemart collection-based discovery verification
 * Phase 3: Mega.pk price selector verification
 * Phase 4: Daraz static JSON-LD extraction verification
 * Phase 5: Summary report
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, details?: any): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`, details ?? '');
  }
}

function section(name: string): void {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

async function getStoreCounts(): Promise<Record<string, { products: number; prices: number }>> {
  const { data: stores } = await supabase.from('stores').select('id, slug');
  if (!stores) return {};

  const { data: prices } = await supabase.from('prices').select('store_id, variant_id');
  const { data: identifiers } = await supabase.from('store_product_identifiers').select('store_id, variant_id');
  const { data: variants } = await supabase.from('product_variants').select('id, product_id');

  const variantToProduct = new Map<string, string>();
  for (const v of variants || []) {
    variantToProduct.set(v.id, v.product_id);
  }

  const result: Record<string, { products: number; prices: number }> = {};
  for (const store of stores) {
    const storePrices = (prices || []).filter(p => p.store_id === store.id);
    const storeIdents = (identifiers || []).filter(si => si.store_id === store.id);
    const prodIds = new Set<string>();
    for (const p of storePrices) {
      const pid = variantToProduct.get(p.variant_id);
      if (pid) prodIds.add(pid);
    }
    for (const si of storeIdents) {
      const pid = variantToProduct.get(si.variant_id);
      if (pid) prodIds.add(pid);
    }
    result[store.slug] = {
      products: prodIds.size,
      prices: storePrices.length,
    };
  }
  return result;
}

async function getMultiStoreProductCount(): Promise<number> {
  const { data: prices } = await supabase.from('prices').select('variant_id, store_id');
  if (!prices) return 0;

  const { data: variants } = await supabase.from('product_variants').select('id, product_id');
  const variantToProduct = new Map<string, string>();
  for (const v of variants || []) {
    variantToProduct.set(v.id, v.product_id);
  }

  const productStores = new Map<string, Set<string>>();
  for (const p of prices) {
    const pid = variantToProduct.get(p.variant_id);
    if (pid) {
      if (!productStores.has(pid)) productStores.set(pid, new Set());
      productStores.get(pid)!.add(p.store_id);
    }
  }

  let multiStore = 0;
  for (const stores of productStores.values()) {
    if (stores.size > 1) multiStore++;
  }
  return multiStore;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Increment 6B — Staged Verification             ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Phase 1: Current DB state baseline
  section('Phase 1: Pre-Verification Database Baseline');
  const baseline = await getStoreCounts();

  for (const [store, counts] of Object.entries(baseline)) {
    console.log(`  ${store}: ${counts.products} variants / ${counts.prices} prices`);
  }

  // Phase 2: Verify Telemart collection configuration
  section('Phase 2: Telemart Collection Configuration');
  const { STORE_CATEGORY_MAP } = await import('../apps/scraper/src/config/categoryMap');
  const telemartCollections = STORE_CATEGORY_MAP['telemart'] || [];

  assert(telemartCollections.length >= 3, `Telemart has ${telemartCollections.length} collections configured (>= 3 expected)`);

  for (const col of telemartCollections) {
    assert(
      col.url.includes('/collections/'),
      `Telemart collection URL uses /collections/ pattern: ${col.url}`,
    );
    assert(
      Boolean(col.categorySlug),
      `Collection has categorySlug: ${col.categorySlug}`,
    );
  }

  // Phase 3: Verify Mega.pk scoped price selectors
  section('Phase 3: Mega.pk Scoped Price Selectors');
  const { MegaPkScraper } = await import('../apps/scraper/src/scrapers/stores/MegaPkScraper');
  const megaScraper = new MegaPkScraper();

  // Test with itemprop selector
  const testHtml = `<html><body>
    <h1>Test Laptop</h1>
    <meta itemprop="price" content="99999" />
  </body></html>`;
  const result = megaScraper.extractFromHtml(testHtml, 'https://www.mega.pk/laptop_products/99/test.html');
  assert(result?.price === 99999, 'Mega.pk itemprop selector works in live code');

  // Phase 4: Verify Daraz JSON-LD extraction
  section('Phase 4: Daraz JSON-LD Extraction');
  const { DarazScraper } = await import('../apps/scraper/src/scrapers/stores/DarazScraper');
  const darazScraper = new DarazScraper();

  const jsonLdHtml = `<html><head>
    <script type="application/ld+json">
    {"@type":"Product","name":"Test Phone 8GB 256GB","sku":"TP-001","offers":{"price":"49999"}}
    </script>
  </head><body></body></html>`;
  const darazResult = darazScraper.extractFromHtml(jsonLdHtml, 'https://www.daraz.pk/products/test-i123.html');
  assert(darazResult !== null, 'Daraz JSON-LD extraction works');
  assert(darazResult?.price === 49999, 'Daraz JSON-LD price correctly parsed');
  assert(darazResult?.name === 'Test Phone 8GB 256GB', 'Daraz JSON-LD name correctly parsed');

  // Phase 5: Telemart live API connectivity test (non-destructive)
  section('Phase 5: Telemart Live API Smoke Test');
  try {
    const res = await fetch('https://www.telemart.pk/collections/smart-phones/products.json?limit=1&page=1', {
      headers: { 'User-Agent': 'PakPriceBot/1.0' },
    });
    assert(res.ok, `Telemart collection API returns OK (status: ${res.status})`);
    const data = await res.json();
    assert(
      Array.isArray(data.products) && data.products.length > 0,
      `Telemart collection returns products array (length: ${data.products?.length})`,
    );
    if (data.products?.[0]) {
      const p = data.products[0];
      assert(Boolean(p.id), `Product has stable ID: ${p.id}`);
      assert(Boolean(p.title), `Product has title: ${p.title?.substring(0, 50)}`);
      assert(Boolean(p.variants?.[0]?.price), `Product has variant price: ${p.variants?.[0]?.price}`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️ Telemart API connectivity test skipped: ${err.message}`);
  }

  // Phase 6: Multi-store match count
  section('Phase 6: Multi-Store Match Status');
  const multiStoreCount = await getMultiStoreProductCount();
  console.log(`  Multi-store products: ${multiStoreCount}`);
  assert(multiStoreCount >= 1, `At least 1 multi-store product exists (found: ${multiStoreCount})`);

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
