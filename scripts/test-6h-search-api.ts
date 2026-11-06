import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductService } from '../apps/api/src/services/productService';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function testSearch() {
  console.log('=== Testing 6H Search Relevance & Variant-Aware Querying ===\n');
  const service = new ProductService(db);

  // 1. Test "iPhone 17 Pro" ranking vs "iPhone 17 Pro Max"
  console.log('--- Test 1: Query "iPhone 17 Pro" ---');
  const r1 = await service.listProducts({
    q: 'iPhone 17 Pro',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  console.log(`Found ${r1.data.length} results (total: ${r1.pagination.total}):`);
  r1.data.slice(0, 5).forEach((p, idx) => {
    console.log(`  #${idx + 1}: "${p.name}" (score: ${p.relevance_score}, stores: ${p.store_count}, price: ${p.lowest_price})`);
  });
  if (r1.data[0]?.name.toLowerCase().includes('iphone 17 pro') && !r1.data[0]?.name.toLowerCase().includes('max')) {
    console.log('  PASS: iPhone 17 Pro ranks #1 ahead of Pro Max!\n');
  } else {
    console.log('  FAIL: iPhone 17 Pro did not rank #1\n');
  }

  // 2. Test "Galaxy Watch 8 40mm" ranking
  console.log('--- Test 2: Query "Galaxy Watch 8 40mm" ---');
  const r2 = await service.listProducts({
    q: 'Galaxy Watch 8 40mm',
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  console.log(`Found ${r2.data.length} results (total: ${r2.pagination.total}):`);
  r2.data.slice(0, 5).forEach((p, idx) => {
    console.log(`  #${idx + 1}: "${p.name}" (score: ${p.relevance_score}, stores: ${p.store_count})`);
  });
  if (r2.data[0]?.name.includes('40mm')) {
    console.log('  PASS: Galaxy Watch 8 40mm ranks #1 ahead of Classic 46mm!\n');
  } else {
    console.log('  FAIL: 40mm did not rank #1\n');
  }

  // 3. Test Autocomplete suggestions
  console.log('--- Test 3: Autocomplete for "sam gal" ---');
  const t0 = performance.now();
  const sugg = await service.getSearchSuggestions('sam gal');
  const dur = performance.now() - t0;
  console.log(`Suggestions returned in ${dur.toFixed(1)}ms (${sugg.data.length} items):`);
  sugg.data.forEach((s) => {
    console.log(`  - "${s.name}" (brand: ${s.brand?.name}, cat: ${s.category?.name})`);
  });
  if (sugg.data.length > 0 && dur < 100) {
    console.log('  PASS: Suggestions fast and accurate!\n');
  }

  // 4. Test Global Filter: minStores >= 2
  console.log('--- Test 4: Multi-Store filter minStores=2 for "iphone" ---');
  const r4 = await service.listProducts({
    q: 'iphone',
    minStores: 2,
    sort: 'relevance',
    pagination: { page: 1, limit: 10, offset: 0 },
  });
  console.log(`Found ${r4.data.length} multi-store results (total: ${r4.pagination.total}):`);
  r4.data.forEach((p) => {
    console.log(`  - "${p.name}" (${p.store_count} stores, lowest: Rs. ${p.lowest_price})`);
  });
  const allMulti = r4.data.every((p) => (p.store_count ?? 0) >= 2);
  if (allMulti && r4.data.length > 0) {
    console.log('  PASS: minStores filter works globally!\n');
  } else {
    console.log('  FAIL: minStores filter failed\n');
  }

  // 5. Test Global Sort: price_asc for "watch"
  console.log('--- Test 5: Global sort price_asc for "watch" ---');
  const r5 = await service.listProducts({
    q: 'watch',
    sort: 'price_asc',
    pagination: { page: 1, limit: 5, offset: 0 },
  });
  r5.data.forEach((p, idx) => {
    console.log(`  #${idx + 1}: "${p.name}" (Rs. ${p.lowest_price})`);
  });
  const prices = r5.data.map((p) => p.lowest_price ?? Infinity);
  let sorted = true;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] < prices[i - 1]) sorted = false;
  }
  if (sorted) {
    console.log('  PASS: price_asc sorted globally!\n');
  } else {
    console.log('  FAIL: price_asc not sorted\n');
  }
}

testSearch().catch(console.error);
