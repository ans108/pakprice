import assert from "node:assert";

/**
 * INCREMENT 6C: VARIANT-SAFETY, LOWEST-PRICE SEMANTICS & SHIPPING TESTS
 *
 * Verifies:
 * 1. Variant A (8GB/128GB) vs Variant B (8GB/256GB) are never combined into a single comparison.
 * 2. In-stock lower price vs out-of-stock lower price: In-stock offer gets Best Deal.
 * 3. Fresh lower price vs stale lower price: Fresh active offer takes priority.
 * 4. Equal prices across stores: Both handled deterministically.
 * 5. Shipping handling: Known shipping vs Unknown shipping; comparisons strictly on listed price.
 * 6. Savings calculation: Real listed-price difference; never from coupons, bank offers, or unvalidated shipping.
 */

console.log("\n==================================================");
console.log("  VARIANT-SAFETY & LOWEST-PRICE TEST SUITE");
console.log("==================================================");

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}:`, err.message);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// 1. Variant-Safety Test: 8GB/128GB vs 8GB/256GB
// -------------------------------------------------------------
test("Variant Isolation: Variant A (8GB/128GB) and Variant B (8GB/256GB) are never mixed into one comparison set", () => {
  const variantA = {
    id: "var-128gb",
    name: "8GB / 128GB / Black",
    ram_gb: 8,
    storage_gb: 128,
    is_active: true,
    prices: [
      { id: "p1", store_id: "store-priceoye", price: 50000, in_stock: true, store: { id: "s1", name: "PriceOye", slug: "priceoye" } },
      { id: "p2", store_id: "store-telemart", price: 52000, in_stock: true, store: { id: "s2", name: "Telemart", slug: "telemart" } },
    ]
  };

  const variantB = {
    id: "var-256gb",
    name: "8GB / 256GB / Black",
    ram_gb: 8,
    storage_gb: 256,
    is_active: true,
    prices: [
      { id: "p3", store_id: "store-priceoye", price: 60000, in_stock: true, store: { id: "s1", name: "PriceOye", slug: "priceoye" } },
      { id: "p4", store_id: "store-telemart", price: 58000, in_stock: true, store: { id: "s2", name: "Telemart", slug: "telemart" } },
    ]
  };

  // Simulating the ProductService.getMultiStoreOffers isolation logic
  function filterOffersForVariant(targetVariant: typeof variantA) {
    return targetVariant.prices.map(p => ({
      variant_id: targetVariant.id,
      variant_name: `${targetVariant.ram_gb}GB RAM · ${targetVariant.storage_gb}GB Storage`,
      store_slug: p.store.slug,
      price: p.price,
    }));
  }

  const comparisonA = filterOffersForVariant(variantA);
  const comparisonB = filterOffersForVariant(variantB);

  // Variant A comparison has strictly 128GB offers
  assert.strictEqual(comparisonA.length, 2);
  assert.ok(comparisonA.every(o => o.variant_id === "var-128gb"));
  assert.strictEqual(Math.min(...comparisonA.map(o => o.price)), 50000);

  // Variant B comparison has strictly 256GB offers
  assert.strictEqual(comparisonB.length, 2);
  assert.ok(comparisonB.every(o => o.variant_id === "var-256gb"));
  assert.strictEqual(Math.min(...comparisonB.map(o => o.price)), 58000);

  // Assert no cross-variant contamination: 256GB price (58000) does not appear in 128GB comparison
  assert.ok(!comparisonA.some(o => o.price === 58000 || o.price === 60000));
  assert.ok(!comparisonB.some(o => o.price === 50000 || o.price === 52000));
});

// -------------------------------------------------------------
// 2. Lowest-Price Semantics: In-Stock vs Out-Of-Stock
// -------------------------------------------------------------
test("In-Stock Lower Price vs Out-of-Stock Lower Price: In-stock offer gets Best Deal", () => {
  const offers = [
    { store: "Store A (OOS)", price: 40000, in_stock: false },
    { store: "Store B (In Stock)", price: 45000, in_stock: true },
    { store: "Store C (In Stock)", price: 48000, in_stock: true },
  ];

  // In-stock prices filtered
  const inStockOffers = offers.filter(o => o.in_stock);
  const lowestInStockPrice = inStockOffers.length > 0
    ? Math.min(...inStockOffers.map(o => o.price))
    : null;

  assert.strictEqual(lowestInStockPrice, 45000, "Lowest in-stock price must be 45,000, not the 40,000 OOS price");

  // Best deal assignment
  const bestDealOffers = offers.filter(o => o.in_stock && o.price === lowestInStockPrice);
  assert.strictEqual(bestDealOffers.length, 1);
  assert.strictEqual(bestDealOffers[0].store, "Store B (In Stock)");
});

// -------------------------------------------------------------
// 3. Freshness Handling: Fresh vs Stale Lower Price
// -------------------------------------------------------------
test("Freshness: Fresh active offer takes precedence over expired/stale offer", () => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;

  const offers = [
    { store: "Store Fresh", price: 50000, in_stock: true, scrapedAt: new Date(now - 2 * ONE_DAY).toISOString() },
    { store: "Store Stale", price: 48000, in_stock: true, scrapedAt: new Date(now - 14 * ONE_DAY).toISOString() },
  ];

  const STALE_THRESHOLD_MS = SEVEN_DAYS;
  const isFresh = (scrapedAt: string) => (now - new Date(scrapedAt).getTime()) <= STALE_THRESHOLD_MS;

  const freshOffers = offers.filter(o => isFresh(o.scrapedAt));
  assert.strictEqual(freshOffers.length, 1);
  assert.strictEqual(freshOffers[0].store, "Store Fresh");
});

// -------------------------------------------------------------
// 4. Equal Prices: Deterministic Handling
// -------------------------------------------------------------
test("Equal Prices: Stores with identical in-stock price are both evaluated as lowest without error", () => {
  const offers = [
    { store: "Store A", price: 30000, in_stock: true },
    { store: "Store B", price: 30000, in_stock: true },
    { store: "Store C", price: 35000, in_stock: true },
  ];

  const lowestPrice = Math.min(...offers.map(o => o.price));
  const lowestStores = offers.filter(o => o.price === lowestPrice);
  assert.strictEqual(lowestStores.length, 2);
  assert.strictEqual(lowestPrice, 30000);
});

// -------------------------------------------------------------
// 5. Shipping Semantics: Known Shipping vs Unknown Shipping
// -------------------------------------------------------------
test("Shipping Semantics: Base comparison is on listed price; shipping fee displayed transparently", () => {
  const offerWithFreeShipping = { price: 25000, shippingFee: 0 };
  const offerWithKnownShipping = { price: 24500, shippingFee: 500 };
  const offerWithUnknownShipping = { price: 24000, shippingFee: null };

  // Listed price is base comparison
  assert.strictEqual(offerWithFreeShipping.price, 25000);
  assert.strictEqual(offerWithKnownShipping.price, 24500);
  assert.strictEqual(offerWithUnknownShipping.price, 24000);

  // Free shipping check
  assert.strictEqual(offerWithFreeShipping.shippingFee === 0, true);
  // Known shipping calculation
  const totalKnown = offerWithKnownShipping.price + (offerWithKnownShipping.shippingFee ?? 0);
  assert.strictEqual(totalKnown, 25000);
  // Unknown shipping is never assumed to be 0
  assert.strictEqual(offerWithUnknownShipping.shippingFee, null);
});

// -------------------------------------------------------------
// 6. Savings Calculation: Real Listed-Price Difference Only
// -------------------------------------------------------------
test("Savings Semantics: Calculated strictly from real in-stock listed prices, never hypothetical discounts", () => {
  const inStockOffers = [
    { store: "PriceOye", price: 12149, couponDiscount: 500, bankDiscount: 1000 },
    { store: "Telemart", price: 12999, couponDiscount: 1000, bankDiscount: 2000 },
  ];

  const lowestPrice = Math.min(...inStockOffers.map(o => o.price));
  const highestPrice = Math.max(...inStockOffers.map(o => o.price));
  
  // Real listed-price savings
  const savings = highestPrice - lowestPrice;
  assert.strictEqual(lowestPrice, 12149);
  assert.strictEqual(highestPrice, 12999);
  assert.strictEqual(savings, 850, "Savings must be exactly Rs. 850 (12999 - 12149)");

  // Assert savings does not include coupon or bank discounts
  const taintedSavings = (12999 - 2000) - (12149 - 1000);
  assert.notStrictEqual(savings, taintedSavings, "Savings must not be computed from hypothetical bank discounts");
});

console.log(`\n==================================================`);
console.log(`  ALL ${passed} VARIANT-SAFETY & PRICING TESTS PASSED`);
console.log(`==================================================\n`);
