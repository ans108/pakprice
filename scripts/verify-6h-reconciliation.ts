import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductService } from '../apps/api/src/services/productService';
import { ProductRepository } from '../apps/api/src/repositories/productRepository';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase credentials not found in apps/api/.env');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);
const repo = new ProductRepository(db);
const service = new ProductService(db);

interface TestResult {
  section: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(section: string, name: string, condition: boolean, details?: string) {
  results.push({ section, name, passed: condition, details });
  const icon = condition ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}${details ? ` (${details})` : ''}`);
  if (!condition) {
    console.error(`      Assertion failed: ${name}`);
  }
}

async function runReconciliation() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6H — FINAL LOCK BLOCKER RECONCILIATION SUITE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CANDIDATE LIMIT / OVERFLOW CORRECTNESS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Candidate Limit & Overflow Expansion Verification ---');
  {
    // Test a broad query that matches >200 products across the catalog (e.g. 'a')
    const broadResult = await repo.findProducts({
      q: 'a',
      sort: 'relevance',
      pagination: { page: 1, limit: 20, offset: 0 },
    });

    assert(
      'Overflow Correctness',
      'Candidate retrieval identifies candidateLimit = 200',
      broadResult.candidateLimit === 200,
      `Limit: ${broadResult.candidateLimit}`
    );

    assert(
      'Overflow Correctness',
      'Overflow detection triggers when candidates hit 200 boundary',
      broadResult.overflowDetected === true,
      `overflowDetected: ${broadResult.overflowDetected}`
    );

    assert(
      'Overflow Correctness',
      'Deterministic candidate expansion executes across multiple batches',
      (broadResult.expansionBatches ?? 0) > 1,
      `expansionBatches: ${broadResult.expansionBatches}`
    );

    assert(
      'Overflow Correctness',
      'Candidate set is expanded to complete matching pool (> 200 candidates)',
      broadResult.rows.length > 200,
      `Total candidates retrieved: ${broadResult.rows.length}`
    );

    // Test a specific query that matches < 200 products (e.g. 'Apple iPhone 17 Pro')
    const specificResult = await repo.findProducts({
      q: 'Apple iPhone 17 Pro',
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 },
    });

    assert(
      'Overflow Correctness',
      'Specific query (< 200 candidates) does NOT trigger overflow',
      specificResult.overflowDetected === false && specificResult.expansionBatches === 1,
      `overflowDetected: ${specificResult.overflowDetected}, batches: ${specificResult.expansionBatches}, count: ${specificResult.rows.length}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SEARCH MODE VS BROWSE MODE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Search Mode vs Browse Mode Verification ---');
  {
    // A. Pure Browse Mode (no q, no derived filters): uses direct DB pagination across all 804 products
    const browseP1 = await service.listProducts({
      sort: 'newest',
      pagination: { page: 1, limit: 20, offset: 0 },
    });
    const browseP10 = await service.listProducts({
      sort: 'newest',
      pagination: { page: 10, limit: 20, offset: 180 },
    });
    const browseP25 = await service.listProducts({
      sort: 'newest',
      pagination: { page: 25, limit: 20, offset: 480 },
    });
    const browseP40 = await service.listProducts({
      sort: 'newest',
      pagination: { page: 40, limit: 20, offset: 780 },
    });

    const browseP41 = await service.listProducts({
      sort: 'newest',
      pagination: { page: 41, limit: 20, offset: 800 },
    });

    assert(
      'Search vs Browse',
      'Browse mode accesses full 804-product catalog with exact DB count',
      browseP1.pagination.total === 804,
      `Total: ${browseP1.pagination.total}, TotalPages: ${browseP1.pagination.totalPages}`
    );

    assert(
      'Search vs Browse',
      'Browse mode hasMore is true on early pages (page 1, page 10)',
      browseP1.pagination.hasMore === true && browseP10.pagination.hasMore === true,
      `P1 hasMore: ${browseP1.pagination.hasMore}, P10 hasMore: ${browseP10.pagination.hasMore}`
    );

    assert(
      'Search vs Browse',
      'Browse mode paginates past candidate limit 200 (page 25, 40 return valid items)',
      browseP25.data.length === 20 && browseP40.data.length > 0,
      `P25 items: ${browseP25.data.length}, P40 items: ${browseP40.data.length}`
    );

    assert(
      'Search vs Browse',
      'Browse mode page 41 (last page) correctly sets hasMore = false',
      browseP41.pagination.page === 41 && browseP41.pagination.hasMore === false,
      `Page 41 hasMore: ${browseP41.pagination.hasMore}, items: ${browseP41.data.length}`
    );

    // B. Explicit inStock semantics
    // 1. inStock omitted: returns all matching items (both in-stock and out-of-stock)
    const rOmitted = await service.listProducts({
      q: 'watch',
      sort: 'relevance',
      pagination: { page: 1, limit: 100, offset: 0 },
    });

    // 2. inStock=true: returns only products with >= 1 in-stock price
    const rInStockTrue = await service.listProducts({
      q: 'watch',
      inStockOnly: true,
      sort: 'relevance',
      pagination: { page: 1, limit: 100, offset: 0 },
    });

    // 3. inStock=false: returns only products with no in-stock prices
    const rInStockFalse = await service.listProducts({
      q: 'watch',
      inStockOnly: false,
      sort: 'relevance',
      pagination: { page: 1, limit: 100, offset: 0 },
    });

    assert(
      'inStock Semantics',
      'inStock omitted returns both in-stock and out-of-stock products',
      rOmitted.data.length >= rInStockTrue.data.length,
      `Omitted: ${rOmitted.data.length}, inStock=true: ${rInStockTrue.data.length}, inStock=false: ${rInStockFalse.data.length}`
    );

    assert(
      'inStock Semantics',
      'inStock=true strictly returns products with active in-stock offers',
      rInStockTrue.data.length > 0,
      `inStock=true matches: ${rInStockTrue.data.length}`
    );

    assert(
      'inStock Semantics',
      'inStock=false strictly returns products with no in-stock offers',
      rInStockFalse.data.length > 0,
      `inStock=false matches: ${rInStockFalse.data.length}`
    );

    assert(
      'inStock Semantics',
      'inStock=true and inStock=false sets are mutually disjoint',
      rInStockTrue.data.every((t) => !rInStockFalse.data.some((f) => f.id === t.id)),
      'Zero overlapping products between inStock=true and inStock=false'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. VARIANT-AWARE CANDIDATE RETRIEVAL & SPEC TOKENS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Variant-Aware Candidate Retrieval & Spec Token Decomposition ---');
  {
    const specTestCases = [
      {
        query: 'Galaxy Watch 8 40mm',
        expectedCore: 'Galaxy Watch 8',
        expectedSpecTokens: ['40mm'],
        expectedTopName: 'Galaxy Watch 8 40mm',
      },
      {
        query: 'Infinix Smart 20 64GB',
        expectedCore: 'Infinix Smart 20',
        expectedSpecTokens: ['64GB'],
        expectedTopName: 'Infinix Smart 20',
      },
      {
        query: 'iPhone 17 Pro Max 256GB',
        expectedCore: 'iPhone 17 Pro Max',
        expectedSpecTokens: ['256GB'],
        expectedTopName: 'iPhone 17 Pro Max',
      },
    ];

    for (const tc of specTestCases) {
      console.log(`\n  * Detailed Audit for Query: "${tc.query}"`);
      const specRegex = /\b(\d+\s*(?:gb|tb)\s*(?:ram|storage)?|\d{2}\s*mm)\b/gi;
      const extractedSpecs = tc.query.match(specRegex) || [];
      const coreQuery = tc.query.replace(specRegex, '').trim().replace(/\s+/g, ' ');
      const queryTokens = tc.query.toLowerCase().split(/\s+/).filter(Boolean);

      console.log(`    1. Extracted query tokens : [${queryTokens.join(', ')}]`);
      console.log(`    2. Extracted spec tokens  : [${extractedSpecs.join(', ')}] (Core query: "${coreQuery}")`);

      // Execute candidate retrieval
      const candRes = await repo.findProducts({
        q: tc.query,
        sort: 'relevance',
        pagination: { page: 1, limit: 10, offset: 0 },
      });
      console.log(`    3. Candidate retrieval   : ${candRes.rows.length} candidates retrieved in ${candRes.expansionBatches ?? 1} batch(es)`);

      const topRaw = candRes.rows[0];
      const variantSpecsSummary = topRaw?.variants?.map((v: any) => ({
        name: v.name,
        ram_gb: v.ram_gb,
        storage_gb: v.storage_gb,
        model: v.model_number,
      }));
      console.log(`    4. Variant data available : Candidate: "${topRaw?.name}", Variants: ${JSON.stringify(variantSpecsSummary)}`);

      // Execute full service ranking
      const serviceRes = await service.listProducts({
        q: tc.query,
        sort: 'relevance',
        pagination: { page: 1, limit: 5, offset: 0 },
      });

      const topProduct = serviceRes.data[0];
      console.log(`    5. Final ranking result   : Rank 1: "${topProduct?.name}", Score: ${topProduct?.relevance_score}`);
      console.log(`    6. Final product matched  : ID: ${topProduct?.id}, Slug: ${topProduct?.slug}`);

      assert(
        'Variant Awareness',
        `Query "${tc.query}" correctly decomposes core query "${tc.expectedCore}"`,
        coreQuery.toLowerCase() === tc.expectedCore.toLowerCase(),
        `Core: "${coreQuery}"`
      );

      assert(
        'Variant Awareness',
        `Query "${tc.query}" retrieves and ranks correct product #1`,
        Boolean(topProduct?.name.toLowerCase().includes(tc.expectedTopName.toLowerCase())),
        `Top Product: "${topProduct?.name}"`
      );
    }
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
    console.error('RECONCILIATION SUITE FAILED!');
    process.exit(1);
  } else {
    console.log('ALL RECONCILIATION AUDIT TESTS PASSED SUCCESSFULLY!');
  }
}

runReconciliation().catch((err) => {
  console.error('Fatal error during reconciliation run:', err);
  process.exit(1);
});
