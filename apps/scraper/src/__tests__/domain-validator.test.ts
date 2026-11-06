import { isValidStoreDomain, STORE_BASE_DOMAINS } from '../validation/DomainValidator';

console.log('─── Running DomainValidator Tests (Increment 6I) ───\n');

let passed = 0;
let failed = 0;

function assert(description: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description} — Expected ${expected}, got ${actual}`);
    failed++;
  }
}

// 1. Boundary tests for PriceOye
assert('Exact domain: priceoye.pk', isValidStoreDomain('https://priceoye.pk/mobiles/samsung', 'priceoye.pk'), true);
assert('Valid subdomain: www.priceoye.pk', isValidStoreDomain('https://www.priceoye.pk/mobiles', 'priceoye.pk'), true);
assert('Valid deep subdomain: deals.store.priceoye.pk', isValidStoreDomain('https://deals.store.priceoye.pk/product', 'priceoye.pk'), true);
assert('Suffix spoof: evilpriceoye.pk is rejected', isValidStoreDomain('https://evilpriceoye.pk/mobiles', 'priceoye.pk'), false);
assert('Subdomain spoof: priceoye.pk.evil.com is rejected', isValidStoreDomain('https://priceoye.pk.evil.com/mobiles', 'priceoye.pk'), false);
assert('Trailing dot normalization: priceoye.pk.', isValidStoreDomain('https://priceoye.pk./mobiles', 'priceoye.pk'), true);
assert('Malformed URL is rejected', isValidStoreDomain('not-a-valid-url', 'priceoye.pk'), false);

// 2. All production store mappings
for (const [slug, domain] of Object.entries(STORE_BASE_DOMAINS)) {
  assert(`Store ${slug} valid domain: ${domain}`, isValidStoreDomain(`https://${domain}/product/123`, domain), true);
  assert(`Store ${slug} www domain: www.${domain}`, isValidStoreDomain(`https://www.${domain}/product/123`, domain), true);
  assert(`Store ${slug} evil domain: evil${domain}`, isValidStoreDomain(`https://evil${domain}/product/123`, domain), false);
  assert(`Store ${slug} phishing domain: ${domain}.evil.com`, isValidStoreDomain(`https://${domain}.evil.com/product/123`, domain), false);
}

console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
