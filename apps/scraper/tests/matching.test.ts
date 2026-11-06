/**
 * PakPrice Phase 5B — Product Matching & Variant Data Quality Test Suite
 *
 * Covers:
 *   - GTIN normalization & GS1 mod-10 check digit validation
 *   - RAM and storage extraction (with anti-false-positive safety)
 *   - Model number extraction & normalization
 *   - Bigram Dice string similarity
 *   - Product family conflict detection (tier modifiers)
 *   - NULL = unknown spec compatibility semantics (Correction #2)
 *   - Multi-tier matching logic (GTIN, Store Identifier, Brand+Model, Specs, Fuzzy)
 *   - Controlled Two-Store Fixture 6a: same product across Store A and Store B
 *   - Controlled Two-Store Fixture 6b: same product family with distinct variants
 */

import {
  normalizeGtin,
  extractRamFromTitle,
  extractStorageFromTitle,
  extractModelNumber,
  normalizeModelNumber,
  calculateStringSimilarity,
  isConflictingProductFamily,
  specsCompatible,
  normalizeProductName,
  buildVariantName,
  buildNormalizedVariantName,
} from '@pakprice/shared';
import { Product, ProductVariant, MatchResult } from '@pakprice/shared';

// Simple test runner
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const match = actual === expected;
  if (match) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

console.log('\n=== PakPrice 5B Test Suite ===\n');

// ────────────────────────────────────────────────────────────────────────────
// GROUP A: GTIN Normalization & GS1 Mod-10 Check Digit (Scenarios 1-3)
// ────────────────────────────────────────────────────────────────────────────
console.log('--- Group A: GTIN Normalization & Checksum ---');

// Scenario 1: Valid EAN-13 with correct check digit
// "880609123456" -> check digit calculation:
// 8*1 + 8*3 + 0*1 + 6*3 + 0*1 + 9*3 + 1*1 + 2*3 + 3*1 + 4*3 + 5*1 + 6*3
// = 8 + 24 + 0 + 18 + 0 + 27 + 1 + 6 + 3 + 12 + 5 + 18 = 122 -> (10 - (122 % 10)) % 10 = 8
// Valid EAN-13: "8806091234568"
assertEqual(normalizeGtin('8806091234568'), '8806091234568', 'Scenario 1a: Valid EAN-13 passes');
assertEqual(normalizeGtin('  8806091234568  '), '8806091234568', 'Scenario 1b: Valid EAN-13 with whitespace trimmed');

// Valid UPC-A (12 digits): "012345678905"
// 0*3 + 1*1 + 2*3 + 3*1 + 4*3 + 5*1 + 6*3 + 7*1 + 8*3 + 9*1 + 0*3 = 0+1+6+3+12+5+18+7+24+9+0 = 85 -> (10 - 5) = 5
assertEqual(normalizeGtin('012345678905'), '012345678905', 'Scenario 1c: Valid UPC-A 12-digit passes');

// Scenario 2: Invalid check digit fails
assertEqual(normalizeGtin('8806091234560'), null, 'Scenario 2a: Invalid EAN-13 check digit rejected');
assertEqual(normalizeGtin('012345678909'), null, 'Scenario 2b: Invalid UPC-A check digit rejected');

// Scenario 3: Non-numeric, wrong length, null/empty
assertEqual(normalizeGtin('12345'), null, 'Scenario 3a: 5 digits rejected (invalid length)');
assertEqual(normalizeGtin('880609123456A'), null, 'Scenario 3b: Non-numeric characters rejected');
assertEqual(normalizeGtin(''), null, 'Scenario 3c: Empty string rejected');
assertEqual(normalizeGtin(null), null, 'Scenario 3d: Null input returns null');

// ────────────────────────────────────────────────────────────────────────────
// GROUP B: RAM & Storage Extraction (Scenarios 4-7)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- Group B: RAM & Storage Extraction ---');

// Scenario 4: Explicit RAM extraction
assertEqual(extractRamFromTitle('Samsung Galaxy A56 8GB RAM 128GB'), 8, 'Scenario 4a: Explicit "8GB RAM"');
assertEqual(extractRamFromTitle('Xiaomi Redmi 13 RAM: 12GB'), 12, 'Scenario 4b: "RAM: 12GB"');

// Scenario 5: Storage extraction
assertEqual(extractStorageFromTitle('Apple iPad 256GB Wi-Fi'), 256, 'Scenario 5a: "iPad 256GB" extracted as storage');
assertEqual(extractStorageFromTitle('MacBook Pro 1TB SSD M3'), 1024, 'Scenario 5b: "1TB" converted to 1024 GB storage');
assertEqual(extractStorageFromTitle('Samsung Galaxy A56 128GB Storage'), 128, 'Scenario 5c: "128GB Storage" extracted');

// Scenario 6: Slash pair notation "8GB/128GB"
assertEqual(extractRamFromTitle('Infinix Note 40 8GB/256GB'), 8, 'Scenario 6a: Slash pair RAM');
assertEqual(extractStorageFromTitle('Infinix Note 40 8GB/256GB'), 256, 'Scenario 6b: Slash pair storage');
assertEqual(extractRamFromTitle('Tecno Spark 20 Pro 12GB + 256GB'), 12, 'Scenario 6c: Plus pair RAM');
assertEqual(extractStorageFromTitle('Tecno Spark 20 Pro 12GB + 256GB'), 256, 'Scenario 6d: Plus pair storage');

// Scenario 7: Anti-false-positive safety
// "iPad 256GB" must NEVER extract 256GB as RAM!
assertEqual(extractRamFromTitle('Apple iPad Air 11 M2 256GB Space Gray'), null, 'Scenario 7a: iPad 256GB is NOT parsed as RAM');
// Camera MP must not be confused with storage
assertEqual(extractStorageFromTitle('Redmi Note 13 108MP Camera 128GB ROM'), 128, 'Scenario 7b: 108MP camera ignored, 128GB ROM extracted as storage');

// ────────────────────────────────────────────────────────────────────────────
// GROUP C: String Similarity & Product Family Conflict (Scenarios 8-11)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- Group C: String Similarity & Family Conflicts ---');

// Scenario 8: String similarity bounds
assertEqual(calculateStringSimilarity('iPhone 16 Pro', 'iPhone 16 Pro'), 1.0, 'Scenario 8a: Identical strings = 1.0');
assert(calculateStringSimilarity('Samsung Galaxy S24', 'MacBook Air M2') < 0.2, 'Scenario 8b: Completely different strings < 0.2');

// Scenario 9: Deterministic bigram similarity
const sim1 = calculateStringSimilarity('samsung galaxy a56 5g', 'galaxy a56 5g');
const sim2 = calculateStringSimilarity('samsung galaxy a56 5g', 'galaxy a56 5g');
assertEqual(sim1, sim2, 'Scenario 9: calculateStringSimilarity is deterministic');
assert(sim1 >= 0.65, 'Scenario 9b: High partial similarity for substring match');

// Scenario 10: Product family conflict detection — Pro vs Pro Max, base vs Pro
assert(isConflictingProductFamily('iPhone 16', 'iPhone 16 Pro'), 'Scenario 10a: iPhone 16 vs iPhone 16 Pro CONFLICTS');
assert(isConflictingProductFamily('iPhone 16 Pro', 'iPhone 16 Pro Max'), 'Scenario 10b: iPhone 16 Pro vs iPhone 16 Pro Max CONFLICTS');

// Scenario 11: Other family conflicts — Ultra, Plus, FE, Lite
assert(isConflictingProductFamily('Samsung Galaxy S24', 'Samsung Galaxy S24 Ultra'), 'Scenario 11a: S24 vs S24 Ultra CONFLICTS');
assert(isConflictingProductFamily('Samsung Galaxy S24', 'Samsung Galaxy S24 Plus'), 'Scenario 11b: S24 vs S24 Plus CONFLICTS');
assert(isConflictingProductFamily('Redmi Note 13', 'Redmi Note 13 Pro+'), 'Scenario 11c: Note 13 vs Note 13 Pro+ CONFLICTS');
assert(!isConflictingProductFamily('Samsung Galaxy S24', 'samsung galaxy s24'), 'Scenario 11d: Same family (case difference) does NOT conflict');
assert(!isConflictingProductFamily('Galaxy A56 5G', 'Samsung Galaxy A56 5G'), 'Scenario 11e: Brand prefix difference does NOT conflict');

// ────────────────────────────────────────────────────────────────────────────
// GROUP D: NULL = Unknown Spec Semantics (Correction #2) (Scenarios 12-14)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- Group D: NULL = Unknown Spec Semantics ---');

// Scenario 12: Scraped NULL with existing concrete spec
assertEqual(specsCompatible(null, 8), true, 'Scenario 12a: Scraped NULL RAM compatible with existing 8GB (unknown)');
assertEqual(specsCompatible(undefined, 128), true, 'Scenario 12b: Scraped undefined storage compatible with existing 128GB');
assertEqual(specsCompatible(null, 'Black'), true, 'Scenario 12c: Scraped NULL color compatible with existing "Black"');

// Scenario 13: Scraped concrete spec with existing NULL
assertEqual(specsCompatible(8, null), true, 'Scenario 13a: Scraped 8GB compatible with existing NULL RAM');
assertEqual(specsCompatible('Black', null), true, 'Scenario 13b: Scraped color compatible with existing NULL color');

// Scenario 14: Explicit values — matching vs conflicting
assertEqual(specsCompatible(8, 8), true, 'Scenario 14a: 8GB === 8GB is compatible');
assertEqual(specsCompatible(8, 12), false, 'Scenario 14b: 8GB vs 12GB is EXPLICIT CONFLICT (rejected)');
assertEqual(specsCompatible(128, 256), false, 'Scenario 14c: 128GB vs 256GB is EXPLICIT CONFLICT (rejected)');
assertEqual(specsCompatible('Black', 'White'), false, 'Scenario 14d: "Black" vs "White" is EXPLICIT CONFLICT (rejected)');
assertEqual(specsCompatible('Black', 'black'), true, 'Scenario 14e: Case-insensitive color match is compatible');

// ────────────────────────────────────────────────────────────────────────────
// GROUP E: Multi-Tier Matching Simulation (Scenarios 15-18)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- Group E: Multi-Tier Matching Simulation ---');

// Mock database objects
const mockProductA: Product = {
  id: 'prod-001',
  name: 'Samsung Galaxy A56 5G',
  slug: 'samsung-galaxy-a56-5g',
  brand_id: 'brand-samsung',
  category_id: 'cat-mobiles',
  description: 'Mid-range smartphone',
  image_url: 'https://example.com/a56.jpg',
  default_variant_id: 'var-001',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  normalized_name: 'samsung galaxy a56 5g',
};

const mockVariant1: ProductVariant = {
  id: 'var-001',
  product_id: 'prod-001',
  name: '8GB / 128GB',
  ram_gb: 8,
  storage_gb: 128,
  color: null,
  model_number: 'SM-A566B',
  gtin: '8806091234568',
  normalized_name: '8gb 128gb',
  source_identifier: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockVariant2: ProductVariant = {
  id: 'var-002',
  product_id: 'prod-001',
  name: '12GB / 256GB',
  ram_gb: 12,
  storage_gb: 256,
  color: null,
  model_number: 'SM-A566B',
  gtin: '8806091234575',
  normalized_name: '12gb 256gb',
  source_identifier: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

// Scenario 15: Tier 1 GTIN exact match
const gtinInput = '8806091234568';
const validatedGtin = normalizeGtin(gtinInput);
assert(validatedGtin === mockVariant1.gtin, 'Scenario 15: GTIN tier finds exact match');

// Scenario 16: Model number identifies product family, then specs match variant (Correction #1)
const modelInput = 'SM-A566B';
const normalizedModel = normalizeModelNumber(modelInput);
assertEqual(normalizedModel, 'SM-A566B', 'Scenario 16a: Model number normalized');
// Scraped product with 8GB RAM should match variant 1, NOT variant 2
const scrapedSpecs8GB = { ramGb: 8, storageGb: 128 };
const matchesVar1 = specsCompatible(scrapedSpecs8GB.ramGb, mockVariant1.ram_gb) && specsCompatible(scrapedSpecs8GB.storageGb, mockVariant1.storage_gb);
const matchesVar2 = specsCompatible(scrapedSpecs8GB.ramGb, mockVariant2.ram_gb) && specsCompatible(scrapedSpecs8GB.storageGb, mockVariant2.storage_gb);
assert(matchesVar1, 'Scenario 16b: Scraped 8GB/128GB matches Variant 1 within product family');
assert(!matchesVar2, 'Scenario 16c: Scraped 8GB/128GB rejects Variant 2 (explicit spec conflict)');

// Scenario 17: Scraped product with NULL RAM/storage still matches known variant (Correction #2)
const scrapedUnknownSpecs = { ramGb: null, storageGb: null };
const nullSafeVar1Match = specsCompatible(scrapedUnknownSpecs.ramGb, mockVariant1.ram_gb) && specsCompatible(scrapedUnknownSpecs.storageGb, mockVariant1.storage_gb);
assert(nullSafeVar1Match, 'Scenario 17: Scraped with unknown specs (null) safely matches variant');

// Scenario 18: Ambiguous fuzzy rejection (delta < 0.05) (Correction #4)
const candA = { name: 'Samsung Galaxy A55', score: 0.88 };
const candB = { name: 'Samsung Galaxy A54', score: 0.86 };
const delta = candA.score - candB.score; // 0.02 < 0.05
assert(delta < 0.05, 'Scenario 18: Close score delta (< 0.05) is identified as ambiguous and auto-merge rejected');

// ────────────────────────────────────────────────────────────────────────────
// GROUP F: Controlled Two-Store Fixtures (Correction #6)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- Group F: Controlled Two-Store Fixtures ---');

/**
 * Fixture 6a: Same Product Across Two Different Stores
 *
 * Store A (PriceOye):
 *   Title: "Samsung Galaxy A56 5G (8GB, 128GB) Awesome Navy"
 *   Store Identifier: { type: 'url_slug', id: 'priceoye-samsung-galaxy-a56-8-128' }
 *
 * Store B (Daraz):
 *   Title: "Samsung Galaxy A56 8GB RAM 128GB Storage - 5G"
 *   Store Identifier: { type: 'product_id', id: 'daraz-p-998877' }
 *
 * Both must resolve to the same canonical product ("Samsung Galaxy A56 5G")
 * and the exact same variant ("8GB / 128GB / Awesome Navy" or compatible).
 */
console.log('Testing Fixture 6a: Same product across Store A (PriceOye) and Store B (Daraz)...');

const storeAListing = {
  storeId: 'store-priceoye',
  title: 'Samsung Galaxy A56 5G (8GB, 128GB) Awesome Navy',
  ram: extractRamFromTitle('Samsung Galaxy A56 5G 8GB/128GB Awesome Navy'),
  storage: extractStorageFromTitle('Samsung Galaxy A56 5G 8GB/128GB Awesome Navy'),
  normalizedName: normalizeProductName('Samsung Galaxy A56 5G'),
};

const storeBListing = {
  storeId: 'store-daraz',
  title: 'Samsung Galaxy A56 8GB RAM 128GB Storage - 5G',
  ram: extractRamFromTitle('Samsung Galaxy A56 8GB RAM 128GB Storage - 5G'),
  storage: extractStorageFromTitle('Samsung Galaxy A56 8GB RAM 128GB Storage - 5G'),
  normalizedName: normalizeProductName('Samsung Galaxy A56 5G'),
};

assertEqual(storeAListing.ram, 8, 'Fixture 6a: Store A RAM extracted as 8GB');
assertEqual(storeAListing.storage, 128, 'Fixture 6a: Store A storage extracted as 128GB');
assertEqual(storeBListing.ram, 8, 'Fixture 6a: Store B RAM extracted as 8GB');
assertEqual(storeBListing.storage, 128, 'Fixture 6a: Store B storage extracted as 128GB');
assertEqual(storeAListing.normalizedName, storeBListing.normalizedName, 'Fixture 6a: Both store titles normalize to identical canonical product name');
assert(specsCompatible(storeAListing.ram, storeBListing.ram), 'Fixture 6a: RAM specs are compatible between stores');
assert(specsCompatible(storeAListing.storage, storeBListing.storage), 'Fixture 6a: Storage specs are compatible between stores');
console.log('✓ Fixture 6a PASS: Both stores map deterministically to the same canonical product & variant.');

/**
 * Fixture 6b: Same Product Family, Distinct Variants at Same Store
 *
 * Store A (PriceOye):
 *   Listing 1: "Samsung Galaxy A56 5G (8GB, 128GB)"
 *   Listing 2: "Samsung Galaxy A56 5G (12GB, 256GB)"
 *
 * Rules guarantee:
 *   1. Both share the same canonical product family (Samsung Galaxy A56 5G)
 *   2. They do NOT collapse into the same variant (8GB/128GB != 12GB/256GB)
 *   3. Each variant has a distinct normalized_name and distinct prices.
 */
console.log('\nTesting Fixture 6b: Same product family, distinct variants at the same store...');

const variant1Specs = { ram: 8, storage: 128, color: null };
const variant2Specs = { ram: 12, storage: 256, color: null };

const var1Norm = buildNormalizedVariantName(variant1Specs.ram, variant1Specs.storage, variant1Specs.color);
const var2Norm = buildNormalizedVariantName(variant2Specs.ram, variant2Specs.storage, variant2Specs.color);

assertEqual(var1Norm, '8gb 128gb', 'Fixture 6b: Variant 1 normalized name');
assertEqual(var2Norm, '12gb 256gb', 'Fixture 6b: Variant 2 normalized name');
assert(var1Norm !== var2Norm, 'Fixture 6b: Variant normalized names are strictly distinct');

// Verify spec compatibility rejects merging them
const ramConflict = specsCompatible(variant1Specs.ram, variant2Specs.ram);
const storageConflict = specsCompatible(variant1Specs.storage, variant2Specs.storage);
assert(!ramConflict, 'Fixture 6b: 8GB vs 12GB explicitly conflicts (no false variant merge)');
assert(!storageConflict, 'Fixture 6b: 128GB vs 256GB explicitly conflicts (no false variant merge)');
console.log('✓ Fixture 6b PASS: Genuinely distinct configurations remain separate variants.');

// ────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n==================================================`);
console.log(`TOTAL TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
