/**
 * Unit & Fixture Tests for Store Scrapers (Paklap, Telemart, Mega.pk, Daraz)
 * Increment 6A — Catalog Coverage, Store Expansion & Product Discovery
 */

import fs from 'fs';
import path from 'path';
import { PaklapScraper } from '../scrapers/stores/PaklapScraper';
import { TelemartScraper } from '../scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../scrapers/stores/MegaPkScraper';
import { DarazScraper } from '../scrapers/stores/DarazScraper';
import { ShophiveScraper } from '../scrapers/stores/ShophiveScraper';
import { PriceOyeScraper } from '../scrapers/stores/PriceOyeScraper';
import { HomeShoppingScraper } from '../scrapers/stores/HomeShoppingScraper';
import { IShoppingScraper } from '../scrapers/stores/IShoppingScraper';
import { MetroScraper } from '../scrapers/stores/MetroScraper';
import { CarrefourScraper } from '../scrapers/stores/CarrefourScraper';
import { NaheedScraper } from '../scrapers/stores/NaheedScraper';
import { AlFatahScraper } from '../scrapers/stores/AlFatahScraper';
import { ScraperRegistry } from '../scrapers/ScraperRegistry';

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

const fixturesDir = path.resolve(__dirname, 'fixtures');

// ============================================================
// 1. Paklap Scraper Tests
// ============================================================
section('Paklap Scraper — Real Fixture & Edge Cases');

const paklapScraper = new PaklapScraper();
const paklapFixturePath = path.join(fixturesDir, 'paklap_product.html');

if (fs.existsSync(paklapFixturePath)) {
  const paklapHtml = fs.readFileSync(paklapFixturePath, 'utf8');
  const paklapUrl = 'https://www.paklap.pk/infinix-inbook-air-xl442-core-i3-laptop-pakistan.html';
  const product = paklapScraper.extractFromHtml(paklapHtml, paklapUrl);

  assert(product !== null, 'Paklap extracted product from real HTML fixture');
  assert(product?.name.includes('Infinix InBook Air XL442'), 'Paklap product title correctly extracted', product?.name);
  assert(product?.price === 135000, 'Paklap price correctly parsed as 135000', product?.price);
  assert(product?.sourceIdentifier === 'INFINIX INBOOK Air XL442', 'Paklap SKU extracted as source identifier', product?.sourceIdentifier);
  assert(product?.sourceIdentifierType === 'sku', 'Paklap identifier type is sku', product?.sourceIdentifierType);
  assert(Boolean(product?.imageUrl && product.imageUrl.includes('www.paklap.pk')), 'Paklap image URL extracted and normalized', product?.imageUrl);
  assert(product?.inStock === true, 'Paklap in-stock status correctly extracted', product?.inStock);
  assert(product?.ramGb === 8, 'Paklap RAM extracted as 8GB', product?.ramGb);
  assert(product?.storageGb === 256, 'Paklap storage extracted as 256GB', product?.storageGb);
  assert(product?.storeSlug === 'paklap', 'Paklap storeSlug is correct', product?.storeSlug);
} else {
  console.warn('⚠️ paklap_product.html fixture not found, skipping fixture extraction test');
}

// Edge Case: Malformed HTML missing title -> returns null
{
  const malformed = '<html><body><div class="price-box"><span class="price">Rs. 50,000</span></div></body></html>';
  const res = paklapScraper.extractFromHtml(malformed, 'https://www.paklap.pk/test.html');
  assert(res === null, 'Paklap malformed HTML without title returns null');
}

// Edge Case: Missing price -> returns null
{
  const missingPrice = '<html><body><h1>Infinix Laptop</h1><div class="stock available">In stock</div></body></html>';
  const res = paklapScraper.extractFromHtml(missingPrice, 'https://www.paklap.pk/test.html');
  assert(res === null, 'Paklap HTML without valid price returns null');
}

// Edge Case: Missing SKU falls back to URL slug
{
  const noSkuHtml = `<html><body>
    <h1 class="page-title"><span>Apple MacBook Pro M3</span></h1>
    <div class="price-final_price"><span class="price">Rs. 550,000</span></div>
    <meta property="og:image" content="https://www.paklap.pk/media/macbook.jpg" />
  </body></html>`;
  const res = paklapScraper.extractFromHtml(noSkuHtml, 'https://www.paklap.pk/apple-macbook-pro-m3.html');
  assert(res !== null, 'Paklap without SKU extracts successfully');
  assert(res?.sourceIdentifier === 'apple-macbook-pro-m3', 'Paklap falls back to URL slug when SKU is absent', res?.sourceIdentifier);
  assert(res?.sourceIdentifierType === 'url_slug', 'Identifier type set to url_slug on fallback');
}

// ============================================================
// 2. Telemart Scraper Tests
// ============================================================
section('Telemart Scraper — Shopify API & HTML Fallback');

const telemartScraper = new TelemartScraper();

// Test Shopify JSON product extraction
{
  const sampleShopify = {
    id: 9876543210,
    title: 'Samsung Galaxy S24 Ultra 12GB 512GB Titanium Gray',
    handle: 'samsung-galaxy-s24-ultra',
    vendor: 'Samsung',
    body_html: '<p>Flagship Samsung phone with AI features.</p>',
    images: [{ src: 'https://cdn.shopify.com/s/files/1/0830/0897/9164/files/s24_ultra.png?v=123' }],
    variants: [
      {
        id: 1122334455,
        price: '389999.00',
        compare_at_price: '419999.00',
        sku: 'SM-S928B-512',
        barcode: '8806095312345',
        available: true,
      },
    ],
  };

  const res = telemartScraper.extractFromShopifyProduct(sampleShopify);
  assert(res !== null, 'Telemart extracts successfully from Shopify JSON payload');
  assert(res?.name === 'Samsung Galaxy S24 Ultra 12GB 512GB Titanium Gray', 'Telemart title extracted');
  assert(res?.price === 389999, 'Telemart price parsed as number', res?.price);
  assert(res?.originalPrice === 419999, 'Telemart originalPrice parsed', res?.originalPrice);
  assert(res?.sourceIdentifier === '9876543210', 'Telemart uses stable Shopify product ID as identifier', res?.sourceIdentifier);
  assert(res?.sourceIdentifierType === 'product_id', 'Telemart identifier type is product_id');
  assert(res?.brand === 'Samsung', 'Telemart brand extracted from vendor');
  assert(res?.ramGb === 12, 'Telemart RAM extracted as 12GB', res?.ramGb);
  assert(res?.storageGb === 512, 'Telemart storage extracted as 512GB', res?.storageGb);
  assert(Boolean(res?.imageUrl && res.imageUrl.includes('cdn.shopify.com')), 'Telemart image URL extracted', res?.imageUrl);
}

// Edge Case: Shopify product with zero/negative price -> returns null
{
  const invalidPriceShopify = {
    id: 111,
    title: 'Free Sample',
    variants: [{ price: '0.00', available: true }],
  };
  const res = telemartScraper.extractFromShopifyProduct(invalidPriceShopify);
  assert(res === null, 'Telemart product with 0 price returns null');
}

// Test Real HTML Fixture if present
const telemartFixturePath = path.join(fixturesDir, 'telemart_product.html');
if (fs.existsSync(telemartFixturePath)) {
  const telemartHtml = fs.readFileSync(telemartFixturePath, 'utf8');
  const res = telemartScraper.extractFromHtml(telemartHtml, 'https://www.telemart.pk/products/sample-product');
  assert(res !== null, 'Telemart extracted from HTML fixture');
  assert(res?.price > 0, 'Telemart HTML price is valid positive number', res?.price);
  assert(Boolean(res?.imageUrl), 'Telemart HTML image is extracted', res?.imageUrl);
}

// ============================================================
// 3. Mega.pk Scraper Tests
// ============================================================
section('Mega.pk Scraper — Real Fixture & Selectors');

const megaScraper = new MegaPkScraper();
const megaFixturePath = path.join(fixturesDir, 'megapk_product.html');

if (fs.existsSync(megaFixturePath)) {
  const megaHtml = fs.readFileSync(megaFixturePath, 'utf8');
  const megaUrl = 'https://www.mega.pk/mobiles_products/26804/Apple-iPhone-17-Pro-Max-256GB-Storage-NON-PTA.html';
  const res = megaScraper.extractFromHtml(megaHtml, megaUrl);

  assert(res !== null, 'Mega.pk extracted product from real fixture');
  assert(res?.name.includes('Apple iPhone 17 Pro Max'), 'Mega.pk title extracted cleanly', res?.name);
  assert(res?.price === 411999, 'Mega.pk price parsed as 411999', res?.price);
  assert(res?.sourceIdentifier === '26804', 'Mega.pk numeric product ID extracted from URL pattern', res?.sourceIdentifier);
  assert(res?.sourceIdentifierType === 'product_id', 'Mega.pk identifier type is product_id');
  assert(Boolean(res?.imageUrl && res.imageUrl.includes('www.mega.pk')), 'Mega.pk og:image extracted', res?.imageUrl);
  assert(res?.storageGb === 256, 'Mega.pk storage extracted as 256GB', res?.storageGb);
  assert(res?.brand === 'Apple', 'Mega.pk brand recognized as Apple', res?.brand);
} else {
  console.warn('⚠️ megapk_product.html fixture not found, skipping fixture extraction test');
}

// Edge Case: Missing price -> returns null
{
  const noPrice = '<html><body><h1>Infinix Phone</h1></body></html>';
  const res = megaScraper.extractFromHtml(noPrice, 'https://www.mega.pk/mobiles_products/123/test.html');
  assert(res === null, 'Mega.pk missing price returns null');
}

// 6B: Test scoped price selectors (itemprop, product_price, price-box)
section('Mega.pk 6B — Scoped Price Selectors');
{
  // itemprop="price" meta extraction
  const ipriceHtml = `<html><body>
    <h1>HP Pavilion 15 Laptop</h1>
    <meta itemprop="price" content="145000" />
    <meta property="og:image" content="https://www.mega.pk/images/hp.jpg" />
  </body></html>`;
  const res = megaScraper.extractFromHtml(ipriceHtml, 'https://www.mega.pk/laptop_products/30001/hp-pavilion.html');
  assert(res !== null, 'Mega.pk extracts price from itemprop="price"');
  assert(res?.price === 145000, 'itemprop price parsed correctly', res?.price);
  assert(res?.brand === 'HP', 'HP brand detected', res?.brand);
}
{
  // product_price scoped selector
  const ppHtml = `<html><body>
    <h1>Samsung Galaxy A55</h1>
    <div class="product_price"><span class="price">Rs. 68,999</span></div>
    <meta property="og:image" content="https://www.mega.pk/images/a55.jpg" />
  </body></html>`;
  const res = megaScraper.extractFromHtml(ppHtml, 'https://www.mega.pk/mobiles_products/30002/samsung-a55.html');
  assert(res !== null, 'Mega.pk extracts from product_price selector');
  assert(res?.price === 68999, 'product_price parsed correctly', res?.price);
}
{
  // price-box scoped selector
  const pbHtml = `<html><body>
    <h1>Lenovo IdeaPad 3</h1>
    <div class="price-box"><span class="price">PKR 95,000</span></div>
  </body></html>`;
  const res = megaScraper.extractFromHtml(pbHtml, 'https://www.mega.pk/laptop_products/30003/lenovo-ideapad.html');
  assert(res !== null, 'Mega.pk extracts from price-box selector');
  assert(res?.price === 95000, 'price-box parsed correctly', res?.price);
}

// ============================================================
// 4. Daraz Scraper Tests
// ============================================================
section('Daraz Scraper — Real Fixture');

const darazScraper = new DarazScraper();
const darazFixturePath = path.join(fixturesDir, 'daraz_product.html');

if (fs.existsSync(darazFixturePath)) {
  const darazHtml = fs.readFileSync(darazFixturePath, 'utf8');
  const darazUrl = 'https://www.daraz.pk/products/2-3-32-3000-i1968648084.html';
  const res = darazScraper.extractFromHtml(darazHtml, darazUrl);

  assert(res !== null, 'Daraz extracted product from real fixture');
  assert(Boolean(res?.name && res.name.length > 3), 'Daraz title extracted', res?.name);
  assert(res?.sourceIdentifier === '1968648084', 'Daraz item ID extracted as product_id', res?.sourceIdentifier);
  assert(res?.sourceIdentifierType === 'product_id', 'Daraz identifier type is product_id');
} else {
  console.warn('⚠️ daraz_product.html fixture not found, skipping fixture extraction test');
}

// 6B: Daraz JSON-LD extraction test
section('Daraz 6B — JSON-LD Fallback Extraction');
{
  const jsonLdHtml = `<html><head>
    <script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Samsung Galaxy S24 FE 8GB 128GB",
      "sku": "SM-S721B",
      "image": "https://img.drz.lazcdn.com/static/pk/s24fe.jpg",
      "offers": {
        "@type": "Offer",
        "price": "134999",
        "priceCurrency": "PKR"
      }
    }
    </script>
  </head><body></body></html>`;
  const res = darazScraper.extractFromHtml(jsonLdHtml, 'https://www.daraz.pk/products/samsung-galaxy-s24-fe-i2055123456.html');
  assert(res !== null, 'Daraz extracts product from JSON-LD when DOM is empty');
  assert(res?.name === 'Samsung Galaxy S24 FE 8GB 128GB', 'JSON-LD name extracted', res?.name);
  assert(res?.price === 134999, 'JSON-LD price extracted', res?.price);
  assert(res?.sku === 'SM-S721B', 'JSON-LD SKU extracted', res?.sku);
  assert(res?.imageUrl?.includes('lazcdn.com'), 'JSON-LD image extracted', res?.imageUrl);
  assert(res?.ramGb === 8, 'RAM parsed from JSON-LD title', res?.ramGb);
  assert(res?.storageGb === 128, 'Storage parsed from JSON-LD title', res?.storageGb);
}

// 6B: Daraz __moduleData__ price extraction test
section('Daraz 6B — __moduleData__ Price Fallback');
{
  const moduleDataHtml = `<html><head>
    <meta property="og:title" content="Xiaomi Redmi Note 13 Pro" />
  </head><body>
    <script>var __moduleData__ = {"skuInfo":{"price":"52999","originalPrice":"59999"}};</script>
  </body></html>`;
  const res = darazScraper.extractFromHtml(moduleDataHtml, 'https://www.daraz.pk/products/xiaomi-redmi-note-13-pro-i1999888777.html');
  assert(res !== null, 'Daraz extracts price from __moduleData__');
  assert(res?.price === 52999, '__moduleData__ price extracted', res?.price);
  assert(res?.originalPrice === 59999, '__moduleData__ originalPrice extracted', res?.originalPrice);
  assert(res?.name === 'Xiaomi Redmi Note 13 Pro', 'Name from og:title', res?.name);
}

// 6B: Daraz edge case — no data at all
{
  const emptyHtml = '<html><body></body></html>';
  const res = darazScraper.extractFromHtml(emptyHtml, 'https://www.daraz.pk/products/nothing-i123.html');
  assert(res === null, 'Daraz empty HTML returns null');
}

// ============================================================
// 5. Telemart 6B — Deduplication Logic
// ============================================================
section('Telemart 6B — Cross-Collection Deduplication');
{
  // Verify extractFromShopifyProduct correctly extracts sourceIdentifier for dedup
  const product1 = telemartScraper.extractFromShopifyProduct({
    id: 12345,
    title: 'iPhone 16 Pro Max 256GB',
    handle: 'iphone-16-pro-max-256gb',
    vendor: 'Apple',
    variants: [{ id: 99, price: '499999.00', available: true }],
    images: [{ src: 'https://cdn.shopify.com/test.jpg' }],
  });
  const product2 = telemartScraper.extractFromShopifyProduct({
    id: 12345,
    title: 'iPhone 16 Pro Max 256GB',
    handle: 'iphone-16-pro-max-256gb',
    vendor: 'Apple',
    variants: [{ id: 99, price: '499999.00', available: true }],
    images: [{ src: 'https://cdn.shopify.com/test.jpg' }],
  });

  assert(product1 !== null && product2 !== null, 'Both extractions succeed');
  assert(
    product1?.sourceIdentifier === product2?.sourceIdentifier,
    'Same product yields same sourceIdentifier for dedup',
  );
  assert(product1?.sourceIdentifier === '12345', 'Shopify product ID used as sourceIdentifier');
}

// ============================================================
// 6. Shophive Scraper Tests
// ============================================================
section('Shophive Scraper — Real Fixture & Edge Cases');

const shophiveScraper = new ShophiveScraper();
const shophiveFixturePath = path.join(fixturesDir, 'shophive_product.html');

if (fs.existsSync(shophiveFixturePath)) {
  const shophiveHtml = fs.readFileSync(shophiveFixturePath, 'utf8');
  const shophiveUrl = 'https://www.shophive.com/dcode-cygnal-evo-4gb-128gb/';
  const product = shophiveScraper.extractProductFromHtml(shophiveHtml, shophiveUrl, 'mobiles');

  assert(product !== null, 'Shophive extracted product from real HTML fixture');
  assert(Boolean(product?.name.includes('Dcode Cygnal Evo')), 'Shophive product title correctly extracted', product?.name);
  assert(product?.price === 31499, 'Shophive price correctly parsed as 31499', product?.price);
  assert(product?.originalPrice === 33999, 'Shophive original price correctly parsed as 33999', product?.originalPrice);
  assert(product?.sourceIdentifier === 'M72395', 'Shophive SKU extracted as source identifier', product?.sourceIdentifier);
  assert(product?.sourceIdentifierType === 'sku', 'Shophive identifier type is sku', product?.sourceIdentifierType);
  assert(Boolean(product?.imageUrl && product.imageUrl.includes('www.shophive.com')), 'Shophive image URL extracted and normalized', product?.imageUrl);
  assert(product?.inStock === true, 'Shophive in-stock status correctly extracted', product?.inStock);
  assert(product?.ramGb === 4, 'Shophive RAM extracted as 4GB', product?.ramGb);
  assert(product?.storageGb === 128, 'Shophive storage extracted as 128GB', product?.storageGb);
  assert(product?.storeSlug === 'shophive', 'Shophive storeSlug is correct', product?.storeSlug);

  // Edge cases
  const malformedHtml = '<html><body><h1>No Price Product</h1></body></html>';
  const noPrice = shophiveScraper.extractProductFromHtml(malformedHtml, 'https://www.shophive.com/test/', 'mobiles');
  assert(noPrice === null, 'Shophive product with missing price returns null');

  const emptyHtml = '<html><body></body></html>';
  const emptyRes = shophiveScraper.extractProductFromHtml(emptyHtml, 'https://www.shophive.com/test/', 'mobiles');
  assert(emptyRes === null, 'Shophive empty HTML returns null');
} else {
  console.warn('⚠️ shophive_product.html fixture not found, skipping fixture extraction test');
}

// ============================================================
// 7. PriceOye Scraper Tests
// ============================================================
section('PriceOye Scraper — Real Fixture & Edge Cases');

const priceoyeScraper = new PriceOyeScraper();
const priceoyeFixturePath = path.join(fixturesDir, 'priceoye_product.html');

if (fs.existsSync(priceoyeFixturePath)) {
  const priceoyeHtml = fs.readFileSync(priceoyeFixturePath, 'utf8');
  const priceoyeUrl = 'https://priceoye.pk/mobiles/samsung/samsung-galaxy-a07';
  const product = priceoyeScraper.extractProductFromHtml(priceoyeHtml, priceoyeUrl);

  assert(product !== null, 'PriceOye extracted product from real HTML fixture');
  assert(Boolean(product?.name.includes('Samsung Galaxy A07')), 'PriceOye product title correctly extracted', product?.name);
  assert(product?.price === 35795, 'PriceOye price correctly parsed as 35795', product?.price);
  assert(product?.originalPrice === 42999, 'PriceOye original price correctly parsed without bundle concatenation', product?.originalPrice);
  assert(product?.discountPercent === 17, 'PriceOye discount percent correctly parsed as 17', product?.discountPercent);
  assert(product?.sourceIdentifier === '11683' || product?.sourceIdentifier === 'samsung-galaxy-a07', 'PriceOye product_id or slug extracted as source identifier', product?.sourceIdentifier);
  assert(Boolean(product?.imageUrl && product.imageUrl.includes('priceoye.pk')), 'PriceOye image URL extracted and normalized', product?.imageUrl);
  assert(product?.inStock === true, 'PriceOye in-stock status correctly extracted', product?.inStock);
  assert(product?.brand === 'Samsung', 'PriceOye brand extracted as Samsung', product?.brand);
  assert(product?.storeSlug === 'priceoye', 'PriceOye storeSlug is correct', product?.storeSlug);

  // Validate through schema
  const valid = (priceoyeScraper as any).validateProduct(product!);
  assert(valid !== null, 'PriceOye extracted product passes ScrapedProductSchema validation');

  // Edge cases
  const malformedHtml = '<html><body><h1>No Price Product</h1></body></html>';
  const noPrice = priceoyeScraper.extractProductFromHtml(malformedHtml, 'https://priceoye.pk/test/');
  assert(noPrice === null, 'PriceOye product with missing price returns null');

  const emptyHtml = '<html><body></body></html>';
  const emptyRes = priceoyeScraper.extractProductFromHtml(emptyHtml, 'https://priceoye.pk/test/');
  assert(emptyRes === null, 'PriceOye empty HTML returns null');

  // Bundle concatenation edge case: multiple line-through spans should not concatenate
  const bundleHtml = `<html><body>
    <div class="product-title">Test Phone</div>
    <div class="summary-price text-black leading-none">Rs. 30,000</div>
    <div class="summary-price line-through leading-none">Rs. 40,000</div>
    <div class="summary-price line-through leading-none">Rs. 2,000</div>
    <span class="badge-percent">25% OFF</span>
  </body></html>`;
  const bundleProd = priceoyeScraper.extractProductFromHtml(bundleHtml, 'https://priceoye.pk/test-phone');
  assert(bundleProd !== null && bundleProd.price === 30000, 'PriceOye parses main price in bundled HTML');
  assert(bundleProd !== null && bundleProd.originalPrice === 40000, 'PriceOye avoids concatenating multiple line-through elements', bundleProd?.originalPrice);
} else {
  console.warn('⚠️ priceoye_product.html fixture not found, skipping fixture extraction test');
}

// ============================================================
// 8. Al-Fatah Scraper Tests
// ============================================================
section('Al-Fatah Scraper — Real Fixture & WooCommerce Store API');

const alfatahScraper = new AlFatahScraper();
const alfatahFixturePath = path.join(fixturesDir, 'alfatah_product.html');

if (fs.existsSync(alfatahFixturePath)) {
  const alfatahHtml = fs.readFileSync(alfatahFixturePath, 'utf8');
  const alfatahUrl = 'https://www.alfatah.com.pk/product/homz-40-liter-electric-water-heater-geyser-hewh-40iot/';
  const product = alfatahScraper.extractProductFromHtml(alfatahHtml, alfatahUrl);

  assert(product !== null, 'Al-Fatah extracted product from HTML fixture');
  assert(Boolean(product?.name.includes('Homz 40 Liter Electric Water Heater')), 'Al-Fatah product title correctly extracted', product?.name);
  assert(product?.price === 39000, 'Al-Fatah price correctly parsed as 39000', product?.price);
  assert(product?.originalPrice === 45000, 'Al-Fatah original price parsed as 45000', product?.originalPrice);
  assert(product?.sourceIdentifier === '00014842', 'Al-Fatah SKU extracted as source identifier', product?.sourceIdentifier);
  assert(product?.sourceIdentifierType === 'sku', 'Al-Fatah identifier type is sku', product?.sourceIdentifierType);
  assert(product?.inStock === true, 'Al-Fatah in-stock status is true', product?.inStock);
  assert(product?.storeSlug === 'al-fatah', 'Al-Fatah storeSlug is correct', product?.storeSlug);
}

// Test Al-Fatah JSON parser
const sampleAlfatahJson = {
  id: 177530,
  name: 'Homz 40 Liter Electric Water Heater Geyser HEWH-40IOT',
  slug: 'homz-40-liter-electric-water-heater-geyser-hewh-40iot',
  permalink: 'https://www.alfatah.com.pk/product/homz-40-liter-electric-water-heater-geyser-hewh-40iot/',
  sku: '00014842',
  prices: { price: '39000', regular_price: '45000', sale_price: '39000', currency_minor_unit: 0 },
  is_in_stock: true,
  images: [{ src: 'https://www.alfatah.com.pk/wp-content/uploads/2026/10/HEWH-40IOT.webp' }],
  brands: [{ name: 'Homz' }],
};
const jsonProd = alfatahScraper.extractProductFromJson(sampleAlfatahJson);
assert(jsonProd !== null, 'Al-Fatah extracted product from WooCommerce Store API JSON');
assert(jsonProd?.price === 39000, 'Al-Fatah API JSON price is 39000', jsonProd?.price);
assert(jsonProd?.originalPrice === 45000, 'Al-Fatah API JSON original price is 45000', jsonProd?.originalPrice);
assert(jsonProd?.brand === 'Homz', 'Al-Fatah API JSON brand is Homz', jsonProd?.brand);

// ============================================================
// 9. Naheed Scraper Tests
// ============================================================
section('Naheed Scraper — Real Fixture & Schema.org JSON-LD');

const naheedScraper = new NaheedScraper();
const naheedFixturePath = path.join(fixturesDir, 'naheed_product.html');

if (fs.existsSync(naheedFixturePath)) {
  const naheedHtml = fs.readFileSync(naheedFixturePath, 'utf8');
  const naheedUrl = 'https://www.naheed.pk/fresh-street-himalayan-pink-salt-onion-125g';
  const product = naheedScraper.extractProductFromHtml(naheedHtml, naheedUrl);

  assert(product !== null, 'Naheed extracted product from HTML fixture');
  assert(Boolean(product?.name.includes('Fresh Street Himalayan Pink Salt')), 'Naheed product title correctly extracted', product?.name);
  assert(product?.price === 510, 'Naheed price correctly parsed as 510', product?.price);
  assert(product?.sourceIdentifier === 'FS-HPS-ONION-125G', 'Naheed SKU extracted as identifier', product?.sourceIdentifier);
  assert(product?.inStock === true, 'Naheed in-stock status is true', product?.inStock);
  assert(product?.storeSlug === 'naheed', 'Naheed storeSlug is correct', product?.storeSlug);
}

// ============================================================
// 10. HomeShopping Scraper Tests
// ============================================================
section('HomeShopping Scraper — Real Fixture');

const homeshoppingScraper = new HomeShoppingScraper();
const homeshoppingFixturePath = path.join(fixturesDir, 'homeshopping_product.html');

if (fs.existsSync(homeshoppingFixturePath)) {
  const hsHtml = fs.readFileSync(homeshoppingFixturePath, 'utf8');
  const hsUrl = 'https://homeshopping.pk/products/Apple-iPhone-15-Pro-Max-256GB.html';
  const product = homeshoppingScraper.extractProductFromHtml(hsHtml, hsUrl);

  assert(product !== null, 'HomeShopping extracted product from HTML fixture');
  assert(Boolean(product?.name.includes('Apple iPhone 15 Pro Max')), 'HomeShopping title correctly extracted', product?.name);
  assert(product?.price === 435000, 'HomeShopping price correctly parsed as 435000', product?.price);
  assert(product?.originalPrice === 460000, 'HomeShopping original price parsed', product?.originalPrice);
  assert(product?.inStock === true, 'HomeShopping inStock status is true', product?.inStock);
  assert(product?.storeSlug === 'homeshopping', 'HomeShopping storeSlug is correct', product?.storeSlug);
}

// ============================================================
// 11. iShopping Scraper Tests
// ============================================================
section('iShopping Scraper — Real Fixture');

const ishoppingScraper = new IShoppingScraper();
const ishoppingFixturePath = path.join(fixturesDir, 'ishopping_product.html');

if (fs.existsSync(ishoppingFixturePath)) {
  const isHtml = fs.readFileSync(ishoppingFixturePath, 'utf8');
  const isUrl = 'https://www.ishopping.pk/samsung-galaxy-s24-ultra.html';
  const product = ishoppingScraper.extractProductFromHtml(isHtml, isUrl);

  assert(product !== null, 'iShopping extracted product from HTML fixture');
  assert(Boolean(product?.name.includes('Samsung Galaxy S24 Ultra')), 'iShopping title correctly extracted', product?.name);
  assert(product?.price === 399999, 'iShopping price correctly parsed as 399999', product?.price);
  assert(product?.originalPrice === 430000, 'iShopping original price parsed as 430000', product?.originalPrice);
  assert(product?.storeSlug === 'ishopping', 'iShopping storeSlug is correct', product?.storeSlug);
}

// ============================================================
// 12. Metro Scraper Tests
// ============================================================
section('Metro Scraper — Real Fixture');

const metroScraper = new MetroScraper();
const metroFixturePath = path.join(fixturesDir, 'metro_product.html');

if (fs.existsSync(metroFixturePath)) {
  const metroHtml = fs.readFileSync(metroFixturePath, 'utf8');
  const metroUrl = 'https://www.metro.pk/olpers-milk-1l.html';
  const product = metroScraper.extractProductFromHtml(metroHtml, metroUrl);

  assert(product !== null, 'Metro extracted product from HTML fixture');
  assert(Boolean(product?.name.includes("Olper's Full Cream Milk")), 'Metro title correctly extracted', product?.name);
  assert(product?.price === 310, 'Metro price correctly parsed as 310', product?.price);
  assert(product?.originalPrice === 330, 'Metro original price parsed as 330', product?.originalPrice);
  assert(product?.storeSlug === 'metro', 'Metro storeSlug is correct', product?.storeSlug);
}

// ============================================================
// 13. Carrefour Scraper Tests
// ============================================================
section('Carrefour Scraper — Real Fixture');

const carrefourScraper = new CarrefourScraper();
const carrefourFixturePath = path.join(fixturesDir, 'carrefour_product.html');

if (fs.existsSync(carrefourFixturePath)) {
  const cfHtml = fs.readFileSync(carrefourFixturePath, 'utf8');
  const cfUrl = 'https://www.carrefour.pk/mafpak/en/p/nestle-milkpak-1l';
  const product = carrefourScraper.extractProductFromHtml(cfHtml, cfUrl);

  assert(product !== null, 'Carrefour extracted product from HTML fixture');
  assert(Boolean(product?.name.includes('Nestle Milkpak Full Cream Milk')), 'Carrefour title correctly extracted', product?.name);
  assert(product?.price === 315, 'Carrefour price correctly parsed as 315', product?.price);
  assert(product?.originalPrice === 335, 'Carrefour original price parsed as 335', product?.originalPrice);
  assert(product?.storeSlug === 'carrefour', 'Carrefour storeSlug is correct', product?.storeSlug);
}

// ============================================================
// 14. Scraper Registry Tests (All 12 Authoritative Stores)
// ============================================================
section('Scraper Registry — Registration & Instantiation (All 12 Stores)');

const registry = ScraperRegistry.getInstance();
const expectedStores = [
  'priceoye',
  'daraz',
  'paklap',
  'telemart',
  'mega-pk',
  'shophive',
  'homeshopping',
  'ishopping',
  'metro',
  'carrefour',
  'naheed',
  'al-fatah',
];

for (const slug of expectedStores) {
  assert(registry.has(slug), `ScraperRegistry has '${slug}' registered`);
  const instance = registry.get(slug);
  assert(instance !== null, `ScraperRegistry returns valid instance for '${slug}'`);
  assert(instance?.getStoreSlug().toLowerCase() === slug.replace('_', '-'), `Instance has correct storeSlug for '${slug}'`);
}

// Summary
console.log('\n══════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

