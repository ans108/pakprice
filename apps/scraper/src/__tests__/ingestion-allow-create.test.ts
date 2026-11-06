import { PriceIngestionService } from '../services/PriceIngestionService';
import { ScrapedProductSchemaType } from '../types/scraperTypes';

console.log('─── Running PriceIngestionService allowCreate Tests (Increment 6I) ───\n');

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description}`);
    failed++;
  }
}

async function runTests() {
  const service = new PriceIngestionService();

  // Test 1: Invalid price safety check (Step 1)
  const invalidPriceProduct: ScrapedProductSchemaType = {
    storeSlug: 'priceoye',
    sourceUrl: 'https://priceoye.pk/mobiles/test-invalid-price',
    sourceIdentifier: 'test-invalid-price-1',
    sourceIdentifierType: 'url_slug',
    name: 'Test Product With Zero Price',
    price: 0,
    inStock: true,
  };
  const res1 = await service.ingest(invalidPriceProduct, 'store-123', true, { allowCreate: false });
  assert('Invalid price is rejected with zero writes', res1.action === 'rejected' && res1.reason === 'Invalid price');

  // Test 2: Mocked / Simulated Matcher Tests using a testable subclass or direct assertion
  // We can create a test subclass that controls ProductMatcher results
  class TestablePriceIngestionService extends PriceIngestionService {
    public mockStatus: 'matched' | 'ambiguous' | 'no_match' = 'no_match';
    public mockProduct: any = null;
    public mockVariant: any = null;
    public productRepoCalls = { createProduct: 0, createVariant: 0 };
    public priceRepoCalls = { upsertCurrentPrice: 0 };

    constructor() {
      super();
      (this as any).matcher = {
        match: async () => {
          if (this.mockStatus === 'matched') {
            return {
              status: 'matched',
              product: this.mockProduct || { id: 'prod-1', name: 'Canonical Product' },
              variant: this.mockVariant || { id: 'var-1', name: 'Canonical Variant' },
              method: 'brand_model',
              confidence: 0.95,
            };
          }
          if (this.mockStatus === 'ambiguous') {
            return {
              status: 'ambiguous',
              candidates: [{ id: 'var-1' }, { id: 'var-2' }],
              reason: 'Multiple variants matched specs',
            };
          }
          return {
            status: 'no_match',
            reason: 'No catalog match found',
          };
        },
      };

      (this as any).productRepo = {
        createProduct: async () => {
          this.productRepoCalls.createProduct++;
          return { id: 'new-prod-id', name: 'New Product' };
        },
        createVariant: async () => {
          this.productRepoCalls.createVariant++;
          return { id: 'new-var-id', name: 'New Variant' };
        },
        getBrandByName: async () => null,
        getCategoryBySlug: async () => null,
        fuzzySearchProduct: async () => null,
        upsertIdentifier: async () => {},
      };

      (this as any).priceRepo = {
        getCurrentPrice: async () => null,
        getLatestHistoryEntry: async () => null,
        upsertCurrentPrice: async () => {
          this.priceRepoCalls.upsertCurrentPrice++;
        },
        insertPriceHistory: async () => {},
        claimMatchingAlerts: async () => [],
      };
    }
  }

  const sampleProduct: ScrapedProductSchemaType = {
    storeSlug: 'priceoye',
    sourceUrl: 'https://priceoye.pk/mobiles/test-phone-abc',
    sourceIdentifier: 'test-phone-abc-1',
    sourceIdentifierType: 'url_slug',
    name: 'Brand New Unknown Phone 123XYZ',
    price: 49999,
    inStock: true,
  };

  // Test 3: Discovery + allowCreate=true + no_match -> existing creation behavior
  const discoveryService = new TestablePriceIngestionService();
  discoveryService.mockStatus = 'no_match';
  const discResult = await discoveryService.ingest(sampleProduct, 'store-1', false); // default allowCreate=true
  assert('Discovery (default allowCreate=true) creates product on no_match', discResult.action === 'inserted_product' || discResult.action === 'inserted_variant');
  assert('Discovery called createProduct', discoveryService.productRepoCalls.createProduct === 1);
  assert('Discovery called createVariant', discoveryService.productRepoCalls.createVariant === 1);

  // Test 4: Refresh + allowCreate=false + no_match -> zero product/variant creation
  const refreshService = new TestablePriceIngestionService();
  refreshService.mockStatus = 'no_match';
  const refreshNoMatch = await refreshService.ingest(sampleProduct, 'store-1', false, { allowCreate: false });
  assert('Refresh (allowCreate=false) rejects no_match', refreshNoMatch.action === 'rejected');
  assert('Refresh rejection reason states creation disabled', refreshNoMatch.reason === 'Product creation disabled (refresh mode)');
  assert('Refresh called 0 createProduct', refreshService.productRepoCalls.createProduct === 0);
  assert('Refresh called 0 createVariant', refreshService.productRepoCalls.createVariant === 0);
  assert('Refresh called 0 price upserts', refreshService.priceRepoCalls.upsertCurrentPrice === 0);

  // Test 5: Refresh + allowCreate=false + ambiguous -> zero writes
  const ambiguousService = new TestablePriceIngestionService();
  ambiguousService.mockStatus = 'ambiguous';
  const refreshAmbiguous = await ambiguousService.ingest(sampleProduct, 'store-1', false, { allowCreate: false });
  assert('Refresh (allowCreate=false) rejects ambiguous match', refreshAmbiguous.action === 'ambiguous_rejected');
  assert('Ambiguous called 0 createProduct', ambiguousService.productRepoCalls.createProduct === 0);
  assert('Ambiguous called 0 createVariant', ambiguousService.productRepoCalls.createVariant === 0);
  assert('Ambiguous called 0 price upserts', ambiguousService.priceRepoCalls.upsertCurrentPrice === 0);

  // Test 6: Refresh + allowCreate=false + matched -> normal price update
  const matchedService = new TestablePriceIngestionService();
  matchedService.mockStatus = 'matched';
  const refreshMatched = await matchedService.ingest(sampleProduct, 'store-1', false, { allowCreate: false });
  assert('Refresh (allowCreate=false) updates price on matched', refreshMatched.action === 'updated_price');
  assert('Matched called 0 createProduct', matchedService.productRepoCalls.createProduct === 0);
  assert('Matched called 0 createVariant', matchedService.productRepoCalls.createVariant === 0);
  assert('Matched called 1 price upsert', matchedService.priceRepoCalls.upsertCurrentPrice === 1);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
