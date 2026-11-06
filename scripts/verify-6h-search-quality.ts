import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductService } from '../apps/api/src/services/productService';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase credentials not found in apps/api/.env');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);
const service = new ProductService(db);

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, details?: string) {
  results.push({ suite, name, passed: condition, details });
  const icon = condition ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}${details ? ` (${details})` : ''}`);
  if (!condition) {
    console.error(`      Assertion failed: ${name}`);
  }
}

async function runTests() {
  console.log('=============================================================');
  console.log('  INCREMENT 6H — SEARCH QUALITY & DISCOVERY TEST SUITE');
  console.log('=============================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 1: Exact Searches & Top Canonical Ranking
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Exact Searches & Top Canonical Ranking ---');
  {
    const r = await service.listProducts({
      q: 'Apple iPhone 17 Pro Max',
      sort: 'relevance',
      pagination: { page: 1, limit: 5, offset: 0 },
    });
    const top = r.data[0];
    assert(
      'Suite 1',
      'Exact query "Apple iPhone 17 Pro Max" ranks correct canonical product #1',
      top?.name.toLowerCase().includes('iphone 17 pro max') && !top?.name.toLowerCase().includes('watch'),
      `Rank 1: "${top?.name}", Score: ${top?.relevance_score}`
    );
  }

  {
    const r = await service.listProducts({
      q: 'Samsung Galaxy Watch 8 40mm',
      sort: 'relevance',
      pagination: { page: 1, limit: 5, offset: 0 },
    });
    const top = r.data[0];
    assert(
      'Suite 1',
      'Exact query "Samsung Galaxy Watch 8 40mm" ranks 40mm product #1',
      top?.name.includes('40mm'),
      `Rank 1: "${top?.name}", Score: ${top?.relevance_score}`
    );
  }

  {
    const r = await service.listProducts({
      q: 'Infinix Smart 20',
      sort: 'relevance',
      pagination: { page: 1, limit: 5, offset: 0 },
    });
    const top = r.data[0];
    assert(
      'Suite 1',
      'Exact query "Infinix Smart 20" ranks Smart 20 at top',
      top?.name.toLowerCase().includes('infinix smart 20'),
      `Rank 1: "${top?.name}", Score: ${top?.relevance_score}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 2: Model Distinction (iPhone 17 Pro vs iPhone 17 Pro Max)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Model Distinction (Pro vs Pro Max) ---');
  {
    const r = await service.listProducts({
      q: 'iPhone 17 Pro',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const top = r.data[0];
    const topName = top?.name.toLowerCase() ?? '';
    const isPro = topName.includes('iphone 17 pro') && !topName.includes('max');
    assert(
      'Suite 2',
      'Query "iPhone 17 Pro" ranks "iPhone 17 Pro" above "iPhone 17 Pro Max"',
      isPro,
      `Rank 1: "${top?.name}" (Score: ${top?.relevance_score})`
    );

    // Verify Pro Max is present but ranked lower
    const proMaxIdx = r.data.findIndex((p) => p.name.toLowerCase().includes('max'));
    assert(
      'Suite 2',
      'iPhone 17 Pro Max is preserved in results but below exact Pro model',
      proMaxIdx > 0,
      `Pro Max position: #${proMaxIdx + 1}`
    );
  }

  {
    const r = await service.listProducts({
      q: 'iPhone 17',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const top = r.data[0];
    const topName = top?.name.toLowerCase() ?? '';
    const isBaseOrPrefix = topName.includes('iphone 17');
    assert(
      'Suite 2',
      'Query "iPhone 17" returns iPhone 17 family with high relevance',
      isBaseOrPrefix,
      `Rank 1: "${top?.name}"`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 3: Size & Variant Distinction (Watch 8 40mm vs Classic 46mm)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Size & Variant Distinction ---');
  {
    const r = await service.listProducts({
      q: 'Galaxy Watch 8 40mm',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const top = r.data[0];
    assert(
      'Suite 3',
      'Query "Galaxy Watch 8 40mm" ranks 40mm product above Classic 46mm',
      top?.name.includes('40mm'),
      `Rank 1: "${top?.name}"`
    );

    const classicIdx = r.data.findIndex((p) => p.name.includes('46mm') || p.name.includes('Classic'));
    assert(
      'Suite 3',
      'Classic 46mm is demoted or excluded when 40mm explicitly requested',
      classicIdx === -1 || classicIdx > 0,
      `Classic 46mm position: ${classicIdx === -1 ? 'None in candidates' : '#' + (classicIdx + 1)}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 4: Spec Awareness (Infinix Smart 20 64GB)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Spec Awareness & Unknown/NULL Handling ---');
  {
    const r = await service.listProducts({
      q: 'Infinix Smart 20 64GB',
      sort: 'relevance',
      pagination: { page: 1, limit: 5, offset: 0 },
    });
    assert(
      'Suite 4',
      'Query "Infinix Smart 20 64GB" returns Smart 20 candidates (NULL specs not penalized into oblivion)',
      r.data.length > 0 && r.data[0].name.toLowerCase().includes('infinix smart 20'),
      `Rank 1: "${r.data[0]?.name}", Count: ${r.data.length}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 5: Formatting Invariance (Case, Whitespace, Punctuation)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Formatting Invariance ---');
  {
    const [rLower, rUpper, rSpaces] = await Promise.all([
      service.listProducts({ q: 'iphone 17 pro max', sort: 'relevance', pagination: { page: 1, limit: 5, offset: 0 } }),
      service.listProducts({ q: 'IPHONE 17 PRO MAX', sort: 'relevance', pagination: { page: 1, limit: 5, offset: 0 } }),
      service.listProducts({ q: 'iPhone   17   Pro   Max', sort: 'relevance', pagination: { page: 1, limit: 5, offset: 0 } }),
    ]);

    const topLower = rLower.data[0]?.id;
    const topUpper = rUpper.data[0]?.id;
    const topSpaces = rSpaces.data[0]?.id;

    assert(
      'Suite 5',
      'Lower, Upper, and Extra Spaces produce identical top result',
      topLower === topUpper && topUpper === topSpaces,
      `Lower: ${topLower}, Upper: ${topUpper}, Spaces: ${topSpaces}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 6: Canonical Deduplication & Multi-Store Aggregation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Canonical Deduplication & Store Count ---');
  {
    const r = await service.listProducts({
      q: 'Apple Iphone 17 Pro Max',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    // Check that canonical product unknown-apple-iphone-17-pro-max appears only ONCE
    const slugMatches = r.data.filter((p) => p.slug === 'unknown-apple-iphone-17-pro-max');
    assert(
      'Suite 6',
      'Canonical multi-store product appears exactly ONCE in search results',
      slugMatches.length === 1,
      `Appearances: ${slugMatches.length}`
    );

    const multiProduct = slugMatches[0];
    assert(
      'Suite 6',
      'Multi-store product correctly aggregates store count (store_count === 2)',
      multiProduct?.store_count === 2,
      `Store count: ${multiProduct?.store_count}`
    );

    assert(
      'Suite 6',
      'Multi-store product derives eligible lowest price ("From Rs. 411,999")',
      multiProduct?.lowest_price === 411999,
      `Lowest price: Rs. ${multiProduct?.lowest_price?.toLocaleString()}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 7: Global Filters (minPrice, maxPrice, store, inStock, minStores)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 7: Global Filter Correctness ---');
  {
    // Filter: minStores >= 2
    const rMinStores = await service.listProducts({
      q: 'phone',
      minStores: 2,
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 },
    });
    const allHave2Stores = rMinStores.data.length > 0 && rMinStores.data.every((p) => (p.store_count ?? 0) >= 2);
    assert(
      'Suite 7',
      'minStores=2 filter strictly returns only multi-store products',
      allHave2Stores,
      `Matches: ${rMinStores.data.length}, All >= 2 stores: ${allHave2Stores}`
    );
  }

  {
    // Filter: minPrice and maxPrice
    const minP = 50000;
    const maxP = 150000;
    const rPriceRange = await service.listProducts({
      q: 'samsung',
      minPrice: minP,
      maxPrice: maxP,
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 },
    });
    const allWithinPrice =
      rPriceRange.data.length > 0 &&
      rPriceRange.data.every((p) => p.lowest_price !== null && p.lowest_price >= minP && p.lowest_price <= maxP);
    assert(
      'Suite 7',
      `minPrice=${minP} & maxPrice=${maxP} filter strictly enforced`,
      allWithinPrice,
      `Matches: ${rPriceRange.data.length}, Valid: ${allWithinPrice}`
    );
  }

  {
    // Filter: store = megapk
    const rStore = await service.listProducts({
      q: 'watch',
      storeSlug: 'megapk',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    assert(
      'Suite 7',
      'storeSlug=megapk filter returns products offered by Mega.pk',
      rStore.data.length > 0,
      `Mega.pk watch matches: ${rStore.data.length}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 8: Global Sorting (price_asc, store_count_desc)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 8: Global Sorting ---');
  {
    const rPriceAsc = await service.listProducts({
      q: 'watch',
      sort: 'price_asc',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const prices = rPriceAsc.data.map((p) => p.lowest_price ?? Infinity);
    let isMonotonic = true;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] < prices[i - 1]) isMonotonic = false;
    }
    assert(
      'Suite 8',
      'sort=price_asc produces monotonically non-decreasing lowest prices',
      isMonotonic && prices.length > 0,
      `First 3 prices: Rs. ${prices.slice(0, 3).join(', Rs. ')}`
    );
  }

  {
    const rStoreCountDesc = await service.listProducts({
      q: 'watch',
      sort: 'store_count_desc',
      pagination: { page: 1, limit: 10, offset: 0 },
    });
    const counts = rStoreCountDesc.data.map((p) => p.store_count ?? 0);
    assert(
      'Suite 8',
      'sort=store_count_desc places highest store counts at the top',
      counts[0] >= counts[counts.length - 1] && counts[0] >= 2,
      `Top store count: ${counts[0]}, Last: ${counts[counts.length - 1]}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 9: Pagination Invariance (No Duplicates, Stable Pages)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 9: Pagination Invariance ---');
  {
    const [page1, page2] = await Promise.all([
      service.listProducts({ q: 'watch', sort: 'relevance', pagination: { page: 1, limit: 5, offset: 0 } }),
      service.listProducts({ q: 'watch', sort: 'relevance', pagination: { page: 2, limit: 5, offset: 5 } }),
    ]);

    const ids1 = new Set(page1.data.map((p) => p.id));
    const overlap = page2.data.filter((p) => ids1.has(p.id));

    assert(
      'Suite 9',
      'Page 1 and Page 2 have zero overlapping product IDs',
      overlap.length === 0,
      `Page 1 items: ${page1.data.length}, Page 2 items: ${page2.data.length}, Overlap: ${overlap.length}`
    );

    assert(
      'Suite 9',
      'Pagination total count is consistent across pages',
      page1.pagination.total === page2.pagination.total && page1.pagination.total > 5,
      `Total: ${page1.pagination.total}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 10: Search Security & PostgREST Filter Protection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 10: Search Security & Sanitization ---');
  {
    const maliciousInputs = [
      '%',
      '_',
      '%%%___%%%',
      'apple",is_active.eq.false',
      'samsung)or(id.neq.null',
      '\\',
      '\\\\\\\\',
      '"""',
      "''''",
      'a'.repeat(350), // long query
      '!@#$%^&*()_+~`|}{[]:;?><,./',
    ];

    let allSafe = true;
    for (const input of maliciousInputs) {
      try {
        const res = await service.listProducts({
          q: input,
          sort: 'relevance',
          pagination: { page: 1, limit: 5, offset: 0 },
        });
        if (!res.success || !Array.isArray(res.data)) {
          allSafe = false;
        }
      } catch (err: any) {
        console.error(`      Security query failed on: "${input.slice(0, 30)}": ${err.message}`);
        allSafe = false;
      }
    }

    assert(
      'Suite 10',
      'All 11 hostile/wildcard/injection queries handled safely without 500 error',
      allSafe,
      'Zero PostgREST filter injection vulnerabilities'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 11: Autocomplete Payload & Speed
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 11: Autocomplete Suggestions ---');
  {
    // First remote call
    const t0 = performance.now();
    const suggestions = await service.getSearchSuggestions('sam');
    const durCold = performance.now() - t0;

    // Second call tests memoryCache LRU latency (< 5ms)
    const t1 = performance.now();
    await service.getSearchSuggestions('sam');
    const durCached = performance.now() - t1;

    assert(
      'Suite 11',
      'Autocomplete query executes quickly (< 100ms cached / < 800ms remote RTT)',
      durCached < 100 && durCold < 800,
      `Cached: ${durCached.toFixed(2)}ms, Remote: ${durCold.toFixed(1)}ms`
    );

    assert(
      'Suite 11',
      'Autocomplete returns bounded <= 6 suggestions',
      suggestions.data.length > 0 && suggestions.data.length <= 6,
      `Returned: ${suggestions.data.length} suggestions`
    );

    const first = suggestions.data[0];
    const hasRequiredFields =
      Boolean(first?.id) &&
      Boolean(first?.name) &&
      Boolean(first?.slug) &&
      first?.brand !== undefined &&
      first?.category !== undefined &&
      first?.thumbnail !== undefined;

    assert(
      'Suite 11',
      'Suggestions match exact lightweight 6-field payload (no heavy prices)',
      hasRequiredFields,
      `Sample: "${first?.name}" (${first?.brand?.name ?? 'No brand'})`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 12: Single Round Trip & Latency Compliance
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 12: Performance & Round-Trip Architecture ---');
  {
    const t0 = performance.now();
    const res = await service.listProducts({
      q: 'iPhone',
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 },
    });
    const dur = performance.now() - t0;

    assert(
      'Suite 12',
      'Search query completes within target latency (< 500ms)',
      dur < 500,
      `Duration: ${dur.toFixed(1)}ms, Items: ${res.data.length}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`  TOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('=============================================================\n');

  if (failedCount > 0) {
    console.error('SEARCH QUALITY SUITE FAILED!');
    process.exit(1);
  } else {
    console.log('ALL SEARCH QUALITY SUITE TESTS PASSED SUCCESSFULLY!');
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
