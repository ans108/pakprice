import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

interface ReconResult {
  store: string;
  baseUrl: string;
  robotsTxt: string;
  categoryUrl: string;
  sampleProductUrl: string;
  antiBotStatus: string;
  hasJsonLd: boolean;
  sampleJsonLd?: any;
  titleSelectorFound: string;
  priceSelectorFound: string;
  originalPriceSelectorFound: string;
  imageSelectorFound: string;
  stockStatusFound: string;
  specsFound: string[];
}

async function inspectRobotsTxt(baseUrl: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl}/robots.txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (res.ok) {
      const text = await res.text();
      return text.substring(0, 300) + '...';
    }
    return `HTTP ${res.status}`;
  } catch (e: any) {
    return `Failed: ${e.message}`;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  LIVE STORE RECONNAISSANCE (Paklap, Telemart, Mega.pk, Daraz)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({ headless: true });
  const fixturesDir = path.resolve(__dirname, '../apps/scraper/src/__tests__/fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // 1. Paklap (https://www.paklap.pk)
  console.log('\n--- 1. Inspecting Paklap (https://www.paklap.pk) ---');
  const paklapRobots = await inspectRobotsTxt('https://www.paklap.pk');
  console.log(`Paklap robots.txt: ${paklapRobots.split('\n')[0]}`);

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  try {
    const paklapCat = 'https://www.paklap.pk/laptops-prices.html';
    console.log(`Navigating to Paklap listing: ${paklapCat}`);
    const res = await page.goto(paklapCat, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = res?.status() || 0;
    const title = await page.title();
    console.log(`Paklap status: ${status}, title: ${title}`);

    const html = await page.content();
    const $ = cheerio.load(html);

    // Save listing fixture for analysis
    const sampleLink = $('.product-item-link, .product-item-info a, a.product-item-photo').first().attr('href');
    console.log(`Paklap sample product URL: ${sampleLink}`);

    if (sampleLink) {
      console.log(`Navigating to Paklap product: ${sampleLink}`);
      await page.goto(sampleLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const prodHtml = await page.content();
      fs.writeFileSync(path.join(fixturesDir, 'paklap_product.html'), prodHtml, 'utf8');
      console.log(`✓ Saved real Paklap product HTML fixture to ${path.join(fixturesDir, 'paklap_product.html')}`);

      const $p = cheerio.load(prodHtml);
      console.log(`Paklap product title: ${$p('.page-title span').text().trim() || $p('h1').text().trim()}`);
      console.log(`Paklap price: ${$p('[data-price-type="finalPrice"] .price, .special-price .price, .price-final_price .price').first().text().trim()}`);
      console.log(`Paklap old price: ${$p('[data-price-type="oldPrice"] .price, .old-price .price').first().text().trim()}`);
      console.log(`Paklap image: ${$p('meta[property="og:image"]').attr('content')}`);
      console.log(`Paklap sku: ${$p('.product.attribute.sku .value').text().trim()}`);
      console.log(`Paklap stock: ${$p('.stock.available, .stock.unavailable').text().trim()}`);
    }
  } catch (err: any) {
    console.error('Paklap recon error:', err.message);
  }

  // 2. Telemart (https://www.telemart.pk)
  console.log('\n--- 2. Inspecting Telemart (https://www.telemart.pk) ---');
  const telemartRobots = await inspectRobotsTxt('https://www.telemart.pk');
  console.log(`Telemart robots.txt: ${telemartRobots.split('\n')[0]}`);

  try {
    console.log('Checking Telemart Shopify products.json...');
    const jsonRes = await fetch('https://www.telemart.pk/products.json?limit=10', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    console.log(`Telemart products.json status: ${jsonRes.status}`);
    if (jsonRes.ok) {
      const json = await jsonRes.json();
      console.log(`Telemart products.json returned ${json.products?.length} products!`);
      if (json.products && json.products.length > 0) {
        const p0 = json.products[0];
        console.log(`Telemart sample product: ${p0.title} (ID: ${p0.id}, Handle: ${p0.handle})`);
        console.log(`Telemart sample price: ${p0.variants?.[0]?.price}, SKU: ${p0.variants?.[0]?.sku}`);
        console.log(`Telemart sample image: ${p0.images?.[0]?.src}`);
        
        const sampleUrl = `https://www.telemart.pk/products/${p0.handle}`;
        console.log(`Navigating to Telemart product page: ${sampleUrl}`);
        await page.goto(sampleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const prodHtml = await page.content();
        fs.writeFileSync(path.join(fixturesDir, 'telemart_product.html'), prodHtml, 'utf8');
        console.log(`✓ Saved real Telemart product HTML fixture to ${path.join(fixturesDir, 'telemart_product.html')}`);
      }
    }
  } catch (err: any) {
    console.error('Telemart recon error:', err.message);
  }

  // 3. Mega.pk (https://www.mega.pk)
  console.log('\n--- 3. Inspecting Mega.pk (https://www.mega.pk) ---');
  const megaRobots = await inspectRobotsTxt('https://www.mega.pk');
  console.log(`Mega.pk robots.txt: ${megaRobots.split('\n')[0]}`);

  try {
    const megaCat = 'https://www.mega.pk/mobiles/';
    console.log(`Navigating to Mega.pk listing: ${megaCat}`);
    const res = await page.goto(megaCat, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = res?.status() || 0;
    const title = await page.title();
    console.log(`Mega.pk status: ${status}, title: ${title}`);

    const html = await page.content();
    const $ = cheerio.load(html);

    // Look for product links on the category page
    const foundLinks: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html'))) {
        foundLinks.push(href);
      }
    });
    console.log(`Mega.pk product links found: ${foundLinks.length}`, foundLinks.slice(0, 5));

    let sampleLink = foundLinks.find((l) => l.includes('_products/'));
    if (!sampleLink && foundLinks.length > 0) sampleLink = foundLinks[0];

    if (sampleLink) {
      const fullUrl = sampleLink.startsWith('http') 
        ? sampleLink 
        : `https://www.mega.pk/${sampleLink.replace(/^\//, '')}`;
      console.log(`Navigating to Mega.pk product: ${fullUrl}`);
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const prodHtml = await page.content();
      fs.writeFileSync(path.join(fixturesDir, 'megapk_product.html'), prodHtml, 'utf8');
      console.log(`✓ Saved real Mega.pk product HTML fixture to ${path.join(fixturesDir, 'megapk_product.html')}`);

      const $p = cheerio.load(prodHtml);
      console.log(`Mega.pk title: ${$p('h1, #header_product_title').first().text().trim()}`);
      console.log(`Mega.pk price: ${$p('.price, #price, span:contains("PKR")').first().text().trim()}`);
      console.log(`Mega.pk og:image: ${$p('meta[property="og:image"]').attr('content')}`);
    }
  } catch (err: any) {
    console.error('Mega.pk recon error:', err.message);
  }

  // 4. Daraz (https://www.daraz.pk)
  console.log('\n--- 4. Inspecting Daraz (https://www.daraz.pk) ---');
  const darazRobots = await inspectRobotsTxt('https://www.daraz.pk');
  console.log(`Daraz robots.txt: ${darazRobots.split('\n')[0]}`);

  try {
    const darazCat = 'https://www.daraz.pk/smartphones/';
    console.log(`Navigating to Daraz category: ${darazCat}`);
    const res = await page.goto(darazCat, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`Daraz status: ${res?.status()}, title: ${await page.title()}`);
    const html = await page.content();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href*="/products/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const full = href.startsWith('//') ? `https:${href}` : href;
        links.push(full);
      }
    });
    console.log(`Daraz product links found: ${links.length}`);
    if (links.length > 0) {
      console.log(`Daraz sample link: ${links[0]}`);
      await page.goto(links[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
      const prodHtml = await page.content();
      fs.writeFileSync(path.join(fixturesDir, 'daraz_product.html'), prodHtml, 'utf8');
      console.log(`✓ Saved real Daraz product HTML fixture to ${path.join(fixturesDir, 'daraz_product.html')}`);
    }
  } catch (err: any) {
    console.error('Daraz recon error:', err.message);
  }

  await browser.close();
  console.log('\nLive store reconnaissance complete.');
}

main();
