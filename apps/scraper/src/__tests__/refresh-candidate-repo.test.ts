import { RefreshUrlRepository } from '../repositories/RefreshUrlRepository';

console.log('─── Running Refresh Candidate Repository Unit Tests (Increment 6I) ───\n');

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  // Test fixtures
  const priceRowsFixture = [
    { id: 'price-1', product_url: 'https://priceoye.pk/p1', variant_id: 'var-1', store_id: 'store-1', last_scraped_at: null },
    { id: 'price-2', product_url: 'https://priceoye.pk/p2', variant_id: 'var-2', store_id: 'store-1', last_scraped_at: '2026-09-01T00:00:00Z' },
    { id: 'price-3', product_url: 'https://priceoye.pk/p3', variant_id: 'var-3', store_id: 'store-1', last_scraped_at: '2026-09-02T00:00:00Z' },
  ];

  // Multiple identifiers for var-1 (should NOT cause candidate duplication!)
  const idRowsFixture = [
    { variant_id: 'var-1', store_id: 'store-1', identifier: 'sku-123', identifier_type: 'sku' },
    { variant_id: 'var-1', store_id: 'store-1', identifier: 'prod-456', identifier_type: 'product_id' },
    { variant_id: 'var-1', store_id: 'store-1', identifier: 'p1-slug', identifier_type: 'url_slug' },
    { variant_id: 'var-2', store_id: 'store-1', identifier: 'sku-789', identifier_type: 'sku' },
  ];

  const mockSupabase = {
    from: (table: string) => {
      if (table === 'prices') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                neq: () => ({
                  order: () => ({
                    order: () => ({
                      limit: async (limit: number) => ({
                        data: priceRowsFixture.slice(0, limit),
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'store_product_identifiers') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: idRowsFixture,
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as any;

  const repo = new RefreshUrlRepository(mockSupabase);

  // Test 1: Deduplication guarantee
  const candidates = await repo.getRefreshCandidates('store-1', 10);
  assert('Candidate count matches prices count exactly (3 candidates for 3 prices)', candidates.length === 3);

  const var1Candidates = candidates.filter(c => c.variantId === 'var-1');
  assert('Exactly 1 candidate returned for var-1 despite having 3 identifier rows', var1Candidates.length === 1);

  // Test 2: Priority selection of identifiers
  assert('Highest-priority identifier (url_slug) selected for var-1', var1Candidates[0].sourceIdentifierType === 'url_slug');
  assert('Source identifier is p1-slug', var1Candidates[0].sourceIdentifier === 'p1-slug');

  // Test 3: Stale-first deterministic ordering
  assert('First candidate has NULL last_scraped_at (stale-first nulls first)', candidates[0].lastScrapedAt === null);
  assert('Second candidate has older timestamp than third', (candidates[1].lastScrapedAt || '') < (candidates[2].lastScrapedAt || ''));

  // Test 4: Limit enforcement
  const limitedCandidates = await repo.getRefreshCandidates('store-1', 2);
  assert('Limit 2 returns exactly 2 candidates', limitedCandidates.length === 2);

  // Test 5: Empty input safety
  const emptyCandidates = await repo.getRefreshCandidates('', 10);
  assert('Empty storeId returns empty array', emptyCandidates.length === 0);

  const zeroLimitCandidates = await repo.getRefreshCandidates('store-1', 0);
  assert('Zero limit returns empty array', zeroLimitCandidates.length === 0);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
