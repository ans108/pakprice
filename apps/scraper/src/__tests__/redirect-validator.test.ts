import { validateStoreRedirect } from '../validation/RedirectValidator';

console.log('─── Running Store-Specific Redirect Identity Tests (Increment 6I) ───\n');

let passed = 0;
let failed = 0;

function assert(description: string, isValid: boolean, expected: boolean, reason?: string) {
  if (isValid === expected) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description} — Expected ${expected}, got ${isValid} (Reason: ${reason})`);
    failed++;
  }
}

// 1. Fast path: Identical URLs (ignoring query/hashes or trailing slashes)
const fastRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55',
  finalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55/',
});
assert('No redirect (identical URL): valid', fastRes.isValid, true);

// 2. Generic: Redirect to homepage or search page
const homeRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55',
  finalUrl: 'https://priceoye.pk/',
});
assert('Redirect to homepage rejected across stores', homeRes.isValid, false, homeRes.reason);

const searchRes = validateStoreRedirect({
  storeSlug: 'telemart',
  originalUrl: 'https://telemart.pk/products/iphone-15',
  finalUrl: 'https://telemart.pk/search?q=iphone',
});
assert('Redirect to search rejected across stores', searchRes.isValid, false, searchRes.reason);

// 3. PriceOye: Category / listing redirects rejected
const poCatRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55',
  finalUrl: 'https://priceoye.pk/smart-phones',
});
assert('PriceOye redirect to /smart-phones category rejected', poCatRes.isValid, false, poCatRes.reason);

const poListingRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55',
  finalUrl: 'https://priceoye.pk/earbuds',
});
assert('PriceOye redirect to /earbuds category rejected', poListingRes.isValid, false, poListingRes.reason);

// PriceOye: Valid redirect with matching product ID
const poValidRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55-old-slug',
  finalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55-new-slug',
  knownIdentifier: 'po-12345',
  scrapedIdentifier: 'po-12345',
});
assert('PriceOye redirect with matching product ID accepted', poValidRes.isValid, true);

// PriceOye: Redirect with changed product ID rejected
const poMismatchRes = validateStoreRedirect({
  storeSlug: 'priceoye',
  originalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a55-old-slug',
  finalUrl: 'https://priceoye.pk/mobiles/samsung/galaxy-a15',
  knownIdentifier: 'po-12345',
  scrapedIdentifier: 'po-99999',
});
assert('PriceOye redirect with mismatched product ID rejected', poMismatchRes.isValid, false, poMismatchRes.reason);

// 4. Telemart: Collections landing rejected
const teleColRes = validateStoreRedirect({
  storeSlug: 'telemart',
  originalUrl: 'https://telemart.pk/products/apple-watch-ultra',
  finalUrl: 'https://telemart.pk/collections/smartwatches',
});
assert('Telemart redirect to collections page rejected', teleColRes.isValid, false, teleColRes.reason);

// Telemart: Valid redirect to another product handle with matching raw.id/SKU
const teleValidRes = validateStoreRedirect({
  storeSlug: 'telemart',
  originalUrl: 'https://telemart.pk/products/apple-watch-ultra',
  finalUrl: 'https://telemart.pk/products/apple-watch-ultra-cellular-49mm',
  knownIdentifier: '84930291039',
  scrapedIdentifier: '84930291039',
});
assert('Telemart redirect preserving Shopify ID accepted', teleValidRes.isValid, true);

// Telemart: Product identity mismatch rejected
const teleMismatchRes = validateStoreRedirect({
  storeSlug: 'telemart',
  originalUrl: 'https://telemart.pk/products/apple-watch-ultra',
  finalUrl: 'https://telemart.pk/products/samsung-galaxy-watch',
  knownIdentifier: '84930291039',
  scrapedIdentifier: '77777777777',
});
assert('Telemart redirect with mismatched Shopify ID rejected', teleMismatchRes.isValid, false, teleMismatchRes.reason);

// 5. Mega.pk: Numeric product ID verification
const megaValidRes = validateStoreRedirect({
  storeSlug: 'mega-pk',
  originalUrl: 'https://www.mega.pk/mobiles_products/24647/Samsung-Galaxy-A55-8GB-256GB.html',
  finalUrl: 'https://www.mega.pk/mobiles_products/24647/Samsung-Galaxy-A55-Awesome-Iceblue.html',
});
assert('Mega.pk redirect preserving numeric product ID 24647 accepted', megaValidRes.isValid, true);

const megaChangedIdRes = validateStoreRedirect({
  storeSlug: 'mega-pk',
  originalUrl: 'https://www.mega.pk/mobiles_products/24647/Samsung-Galaxy-A55-8GB-256GB.html',
  finalUrl: 'https://www.mega.pk/mobiles_products/25000/Samsung-Galaxy-A35.html',
});
assert('Mega.pk redirect with changed product ID (24647 -> 25000) rejected', megaChangedIdRes.isValid, false, megaChangedIdRes.reason);

const megaNonProductRes = validateStoreRedirect({
  storeSlug: 'mega-pk',
  originalUrl: 'https://www.mega.pk/mobiles_products/24647/Samsung-Galaxy-A55.html',
  finalUrl: 'https://www.mega.pk/mobiles/',
});
assert('Mega.pk redirect to non-product listing rejected', megaNonProductRes.isValid, false, megaNonProductRes.reason);

// 6. Shophive: SKU verification
const shopValidRes = validateStoreRedirect({
  storeSlug: 'shophive',
  originalUrl: 'https://www.shophive.com/apple-iphone-15-pro-max-old',
  finalUrl: 'https://www.shophive.com/apple-iphone-15-pro-max-new',
  knownIdentifier: 'APL-IP15PM-256',
  scrapedSku: 'APL-IP15PM-256',
});
assert('Shophive redirect preserving SKU accepted', shopValidRes.isValid, true);

const shopMismatchRes = validateStoreRedirect({
  storeSlug: 'shophive',
  originalUrl: 'https://www.shophive.com/apple-iphone-15-pro-max',
  finalUrl: 'https://www.shophive.com/apple-iphone-14-pro',
  knownIdentifier: 'APL-IP15PM-256',
  scrapedSku: 'APL-IP14P-128',
});
assert('Shophive redirect with changed SKU rejected', shopMismatchRes.isValid, false, shopMismatchRes.reason);

const shopCheckoutRes = validateStoreRedirect({
  storeSlug: 'shophive',
  originalUrl: 'https://www.shophive.com/apple-iphone-15',
  finalUrl: 'https://www.shophive.com/checkout/cart',
});
assert('Shophive redirect to checkout/cart rejected', shopCheckoutRes.isValid, false, shopCheckoutRes.reason);

console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
process.exit(0);
