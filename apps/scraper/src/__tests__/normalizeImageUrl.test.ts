/**
 * Unit tests for normalizeImageUrl
 * Increment 5D — Product Image Reliability & Rendering Hardening
 */

import { normalizeImageUrl } from '../utils/scraperUtils';
import { scraperConfig } from '../config/scraperConfig';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: any): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`, details !== undefined ? details : '');
  }
}

function section(name: string): void {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

section('normalizeImageUrl — Core Functionality');

// 1. Valid PriceOye CDN URL
{
  const input = 'https://images.priceoye.pk/apple-iphone-15-pro.jpg';
  const result = normalizeImageUrl(input);
  assert(result === input, 'Valid PriceOye CDN URL preserved', { input, result });
}

// 2. OG image URL with tracking params + CDN params
{
  const input = 'https://images.priceoye.pk/img.jpg?utm_source=fb&w=800';
  const expected = 'https://images.priceoye.pk/img.jpg?w=800';
  const result = normalizeImageUrl(input);
  assert(result === expected, 'Tracking params stripped while CDN resize param (w=800) is preserved', { input, result, expected });
}

// 3. Protocol-relative URL
{
  const input = '//images.priceoye.pk/img.jpg';
  const expected = 'https://images.priceoye.pk/img.jpg';
  const result = normalizeImageUrl(input);
  assert(result === expected, 'Protocol-relative URL upgraded to https://', { input, result, expected });
}

// 4. data: URL
{
  const input = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = normalizeImageUrl(input);
  assert(result === null, 'data: URL rejected -> null', { input, result });
}

// 5. blob: URL
{
  const input = 'blob:https://example.com/abc-123-def';
  const result = normalizeImageUrl(input);
  assert(result === null, 'blob: URL rejected -> null', { input, result });
}

// 6. javascript: URL
{
  const input = 'javascript:void(0)';
  const result = normalizeImageUrl(input);
  assert(result === null, 'javascript: URL rejected -> null', { input, result });
}

// 7. URL exceeding max length (default 2048)
{
  const longPath = 'a'.repeat(scraperConfig.imageMaxUrlLength + 10);
  const input = `https://images.priceoye.pk/${longPath}.jpg`;
  const result = normalizeImageUrl(input);
  assert(result === null, 'URL exceeding scraperConfig.imageMaxUrlLength rejected -> null', { len: input.length, max: scraperConfig.imageMaxUrlLength });
}

// 8. Unparseable string
{
  const input = 'not a url at all';
  const result = normalizeImageUrl(input);
  assert(result === null, 'Unparseable string rejected -> null', { input, result });
}

// 9. CDN URL with multiple resize params preserved
{
  const input = 'https://images.priceoye.pk/img.jpg?w=400&h=400&format=webp';
  const result = normalizeImageUrl(input);
  assert(result === input, 'Multiple CDN resize params (w, h, format) preserved without modification', { input, result });
}

// 10. Known fbclid tracking param stripped
{
  const input = 'https://images.priceoye.pk/img.jpg?fbclid=IwAR2...&w=400';
  const expected = 'https://images.priceoye.pk/img.jpg?w=400';
  const result = normalizeImageUrl(input);
  assert(result === expected, 'fbclid stripped and w=400 preserved', { input, result, expected });
}

// 11. Additional tracking params (gclid, ref, utm_medium, utm_campaign)
{
  const input = 'https://images.priceoye.pk/img.jpg?gclid=xyz&ref=partner&utm_campaign=summer&q=80';
  const expected = 'https://images.priceoye.pk/img.jpg?q=80';
  const result = normalizeImageUrl(input);
  assert(result === expected, 'gclid, ref, utm_campaign stripped and q=80 preserved', { input, result, expected });
}

// 12. Null, undefined, empty, and whitespace
{
  assert(normalizeImageUrl(null) === null, 'null -> null');
  assert(normalizeImageUrl(undefined) === null, 'undefined -> null');
  assert(normalizeImageUrl('') === null, 'empty string -> null');
  assert(normalizeImageUrl('   ') === null, 'whitespace string -> null');
}

// 13. URL with no TLD / dot in hostname (valid structure like http://localhost:3000/img.jpg or https://cdn/img.jpg)
{
  const input = 'https://cdn/product.jpg';
  const result = normalizeImageUrl(input);
  assert(result === input, 'URL without dot in hostname is parsed without artificial TLD restriction', { input, result });
}

// 14. URL with no file extension
{
  const input = 'https://images.priceoye.pk/image-store/1298491823';
  const result = normalizeImageUrl(input);
  assert(result === input, 'URL without file extension is preserved', { input, result });
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

if (failed > 0) {
  process.exit(1);
}
