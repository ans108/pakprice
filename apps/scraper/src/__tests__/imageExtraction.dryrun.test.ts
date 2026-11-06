/**
 * Dry-run extraction tests for product image extraction chains.
 * Increment 5D — Product Image Reliability & Rendering Hardening
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { normalizeImageUrl } from '../utils/scraperUtils';

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

/**
 * PriceOye image extraction logic matching PriceOyeScraper.ts
 */
function extractPriceOyeImage($: cheerio.CheerioAPI): string | null {
  return (
    normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
    normalizeImageUrl($('.product-image img').attr('src')) ||
    normalizeImageUrl($('.product-image img').attr('data-src')) ||
    null
  );
}

/**
 * Daraz image extraction logic matching DarazScraper.ts
 */
function extractDarazImage($: cheerio.CheerioAPI): string | null {
  return (
    normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
    normalizeImageUrl($('.gallery-preview-panel__image').attr('src')) ||
    normalizeImageUrl($('.gallery-preview-panel__image').attr('data-src')) ||
    null
  );
}

const fixturesDir = path.join(__dirname, 'fixtures');

section('PriceOye Image Extraction Priority Chain');

// 1. OG image is selected first when present, ignoring lazy placeholder img[src]
{
  const html = fs.readFileSync(path.join(fixturesDir, 'priceoye_product_with_og_image.html'), 'utf-8');
  const $ = cheerio.load(html);
  const imageUrl = extractPriceOyeImage($);
  const expected = 'https://images.priceoye.pk/apple-iphone-15-pro-pakistan-priceoye-7a91b.jpg';
  assert(imageUrl === expected, 'OG image selected first over data: SVG placeholder img[src]', { imageUrl, expected });
}

// 2. Falls back to img[src] when OG is absent and src is valid
{
  const html = fs.readFileSync(path.join(fixturesDir, 'priceoye_product_no_og_image.html'), 'utf-8');
  const $ = cheerio.load(html);
  const imageUrl = extractPriceOyeImage($);
  const expected = 'https://images.priceoye.pk/samsung-galaxy-s24-ultra-pakistan-priceoye-381x0.jpg';
  assert(imageUrl === expected, 'Falls back to .product-image img[src] when og:image absent', { imageUrl, expected });
}

// 3. Falls back to img[data-src] when src is a placeholder gif
{
  const html = fs.readFileSync(path.join(fixturesDir, 'priceoye_product_data_src_only.html'), 'utf-8');
  const $ = cheerio.load(html);
  const imageUrl = extractPriceOyeImage($);
  const expected = 'https://images.priceoye.pk/xiaomi-14-pakistan-priceoye-91823.jpg';
  assert(imageUrl === expected, 'Falls back to .product-image img[data-src] when src is a placeholder gif', { imageUrl, expected });
}

// 4. Returns null when no valid image found in markup
{
  const html = '<html><body><div class="product-page"><h1>No Image Product</h1></div></body></html>';
  const $ = cheerio.load(html);
  const imageUrl = extractPriceOyeImage($);
  assert(imageUrl === null, 'Returns null when no image tags present', { imageUrl });
}

section('Daraz Image Extraction Priority Chain');

// 5. Daraz OG image selected over JS placeholder spinner
{
  const html = fs.readFileSync(path.join(fixturesDir, 'daraz_product_with_og_image.html'), 'utf-8');
  const $ = cheerio.load(html);
  const imageUrl = extractDarazImage($);
  const expected = 'https://pk-live-21.slatic.net/kf/S1029384756.jpg';
  assert(imageUrl === expected, 'Daraz server-rendered og:image selected over loading spinner', { imageUrl, expected });
}

// 6. Daraz missing image returns null
{
  const html = '<html><body><div class="pdp-block"><h1>No Image Product</h1></div></body></html>';
  const $ = cheerio.load(html);
  const imageUrl = extractDarazImage($);
  assert(imageUrl === null, 'Daraz returns null when no image tags present', { imageUrl });
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

if (failed > 0) {
  process.exit(1);
}
