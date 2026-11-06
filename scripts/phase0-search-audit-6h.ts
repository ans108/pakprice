import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductService } from '../apps/api/src/services/productService';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function runPhase0Audit() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6H — PHASE 0: READ-ONLY SEARCH & DISCOVERY AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const productService = new ProductService(db);

  // ── 1. TEST SEARCH QUERIES ──────────────────────────────────────
  const testQueries = [
    // Exact canonical
    'Apple iPhone 17 Pro Max',
    'Samsung Galaxy Watch 8 40mm',
    'Infinix Smart 20',
    // Broad partial
    'iPhone',
    'Galaxy Watch',
    'Smart Watch',
    'laptop',
    // Formatting & casing
    'iphone 17 pro max',
    'IPHONE 17 PRO MAX',
    'iphone   17   pro max',
    // Model distinctions
    'iPhone 17 Pro',
    // Variant / spec distinction
    'Galaxy Watch 8 40mm',
    'Galaxy Watch 8 46mm',
    'Infinix Smart 20 64GB',
  ];

  console.log('--- 1. Evaluating Current Search Query Results ---');
  for (const q of testQueries) {
    const t0 = performance.now();
    const res = await productService.listProducts({
      q,
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const duration = performance.now() - t0;

    console.log(`\nQuery: "${q}" | Results: ${res.pagination.total} | Latency: ${duration.toFixed(1)}ms`);
    if (res.data.length > 0) {
      res.data.slice(0, 5).forEach((p, idx) => {
        console.log(`  [${idx + 1}] "${p.name}" (Slug: ${p.slug})`);
        console.log(`      Brand: ${p.brand?.name || 'none'} | Category: ${p.category?.name || 'none'}`);
        console.log(`      Stores: ${p.store_count} | Lowest Price: Rs. ${p.lowest_price?.toLocaleString() || 'null'} | Updated: ${p.updated_at}`);
      });
    } else {
      console.log('  (No results)');
    }
  }

  // ── 2. RANKING BEHAVIOR ANALYSIS ────────────────────────────────
  console.log('\n--- 2. Auditing Current Ranking for "Samsung Galaxy Watch 8 40mm" ---');
  const watchResults = await productService.listProducts({
    q: 'Samsung Galaxy Watch 8 40mm',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  console.log(`Total found: ${watchResults.data.length}`);
  watchResults.data.forEach((p, i) => {
    console.log(`  Position ${i + 1}: "${p.name}" (updated_at: ${p.updated_at})`);
  });

  console.log('\n--- 3. Auditing Current Ranking for "iPhone 17" vs "iPhone 17 Pro Max" ---');
  const iphoneResults = await productService.listProducts({
    q: 'iPhone 17',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  iphoneResults.data.forEach((p, i) => {
    console.log(`  Position ${i + 1}: "${p.name}" (updated_at: ${p.updated_at})`);
  });

  // ── 3. PAGINATION & BOUNDS CHECK ────────────────────────────────
  console.log('\n--- 4. Auditing Current Pagination & Determinism ---');
  const page1 = await productService.listProducts({
    q: 'samsung',
    sort: 'relevance',
    pagination: { page: 1, limit: 5, offset: 0 },
  });
  const page2 = await productService.listProducts({
    q: 'samsung',
    sort: 'relevance',
    pagination: { page: 2, limit: 5, offset: 5 },
  });

  const page1Ids = new Set(page1.data.map(p => p.id));
  const overlap = page2.data.filter(p => page1Ids.has(p.id));
  console.log(`Page 1: ${page1.data.length} items, total: ${page1.pagination.total}, hasMore: ${page1.pagination.hasMore}`);
  console.log(`Page 2: ${page2.data.length} items, total: ${page2.pagination.total}, hasMore: ${page2.pagination.hasMore}`);
  console.log(`Page 1 & 2 Overlap: ${overlap.length} (expected 0)`);

  // ── 4. FILTER CAPABILITIES ──────────────────────────────────────
  console.log('\n--- 5. Auditing Current Filter Capabilities ---');
  const brandFiltered = await productService.listProducts({
    brandSlug: 'apple',
    sort: 'relevance',
    pagination: { page: 1, limit: 5, offset: 0 },
  });
  console.log(`Brand filter (apple): ${brandFiltered.pagination.total} products`);

  const catFiltered = await productService.listProducts({
    categorySlug: 'mobiles',
    sort: 'relevance',
    pagination: { page: 1, limit: 5, offset: 0 },
  });
  console.log(`Category filter (mobiles): ${catFiltered.pagination.total} products`);
}

runPhase0Audit().catch(console.error);
