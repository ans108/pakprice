import axios from 'axios';
import * as cheerio from 'cheerio';

interface StoreCandidate {
  name: string;
  slug: string;
  baseUrl: string;
  categoryPaths: string[];
}

const CANDIDATES: StoreCandidate[] = [
  {
    name: 'Shophive',
    slug: 'shophive',
    baseUrl: 'https://www.shophive.com',
    categoryPaths: ['/mobile-phones', '/laptops', '/smart-watches'],
  },
  {
    name: 'HomeShopping',
    slug: 'homeshopping',
    baseUrl: 'https://homeshopping.pk',
    categoryPaths: ['/categories/Mobiles-Prices-in-Pakistan/', '/categories/Laptops-Prices-in-Pakistan/'],
  },
  {
    name: 'iShopping',
    slug: 'ishopping',
    baseUrl: 'https://www.ishopping.pk',
    categoryPaths: ['/electronics/mobile-phones-pakistan.html', '/electronics/laptops-prices-in-pakistan.html'],
  },
  {
    name: 'Paklap',
    slug: 'paklap',
    baseUrl: 'https://www.paklap.pk',
    categoryPaths: ['/laptops-prices.html'],
  },
  {
    name: 'Naheed',
    slug: 'naheed',
    baseUrl: 'https://www.naheed.pk',
    categoryPaths: ['/electronics'],
  },
  {
    name: 'Al-Fatah',
    slug: 'al-fatah',
    baseUrl: 'https://alfatah.pk',
    categoryPaths: ['/collections/smartphones-tablets'],
  },
  {
    name: 'Metro',
    slug: 'metro',
    baseUrl: 'https://www.metro-online.pk',
    categoryPaths: ['/electronics'],
  },
  {
    name: 'Carrefour',
    slug: 'carrefour',
    baseUrl: 'https://www.carrefour.pk',
    categoryPaths: ['/mafpak/en/c/NFPAK4000000'],
  }
];

async function testCandidate(c: StoreCandidate) {
  console.log(`\n=============================================================`);
  console.log(`  AUDITING: ${c.name} (${c.baseUrl})`);
  console.log(`=============================================================`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // 1. Robots.txt
  let robotsStatus = 'unknown';
  try {
    const rRes = await axios.get(`${c.baseUrl}/robots.txt`, { headers, timeout: 10000 });
    robotsStatus = `HTTP ${rRes.status} (length: ${rRes.data?.length || 0})`;
  } catch (e: any) {
    robotsStatus = `Failed (${e.response?.status || e.message})`;
  }
  console.log(`  Robots.txt:         ${robotsStatus}`);

  // 2. Homepage Accessibility
  let homeStatus = 0;
  let homeAntiBot = 'none';
  let homeTitle = '';
  try {
    const hRes = await axios.get(c.baseUrl, { headers, timeout: 12000, maxRedirects: 5 });
    homeStatus = hRes.status;
    const $ = cheerio.load(hRes.data);
    homeTitle = $('title').text().trim().slice(0, 60);

    const html = String(hRes.data).toLowerCase();
    if (html.includes('cloudflare') && (html.includes('attention required') || html.includes('cf-chl') || html.includes('turnstile'))) {
      homeAntiBot = 'Cloudflare challenge/WAF';
    } else if (html.includes('datadome') || html.includes('perimeterx') || html.includes('incapsula')) {
      homeAntiBot = 'Commercial Bot Protection';
    }
  } catch (e: any) {
    homeStatus = e.response?.status || 0;
    homeAntiBot = e.response?.status === 403 ? 'HTTP 403 Forbidden / Anti-Bot' : `Error: ${e.message}`;
  }
  console.log(`  Homepage HTTP:      ${homeStatus} | Title: "${homeTitle}"`);
  console.log(`  Homepage Anti-Bot:  ${homeAntiBot}`);

  // 3. Category Page & Product Link Discovery
  let catStatus = 0;
  let sampleProductUrl: string | null = null;
  let discoveredLinksCount = 0;

  for (const catPath of c.categoryPaths) {
    const fullCatUrl = `${c.baseUrl}${catPath}`;
    try {
      const catRes = await axios.get(fullCatUrl, { headers, timeout: 12000 });
      catStatus = catRes.status;
      const $ = cheerio.load(catRes.data);
      const links: string[] = [];

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        let resolved = href;
        if (href.startsWith('/')) resolved = `${c.baseUrl}${href}`;
        // Basic filter for product-like URLs
        if (
          resolved.includes('/product') ||
          resolved.includes('/p/') ||
          resolved.includes('.html') ||
          resolved.includes('/item') ||
          (resolved.split('/').length > 4 && !resolved.includes('/category') && !resolved.includes('/collections') && !resolved.includes('/cart'))
        ) {
          links.push(resolved);
        }
      });

      discoveredLinksCount = links.length;
      if (links.length > 0) {
        sampleProductUrl = links[0];
        console.log(`  Category Page:      ${fullCatUrl} -> HTTP ${catStatus} (${links.length} product candidate links)`);
        break;
      }
    } catch (e: any) {
      console.log(`  Category Page:      ${fullCatUrl} -> Failed (${e.response?.status || e.message})`);
    }
  }

  // 4. Product Page Inspection if sample discovered
  if (sampleProductUrl) {
    console.log(`  Sample Product URL: ${sampleProductUrl}`);
    try {
      const pRes = await axios.get(sampleProductUrl, { headers, timeout: 12000 });
      const $ = cheerio.load(pRes.data);
      const title = $('h1').text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const image = $('meta[property="og:image"]').attr('content') || $('img.product-image').first().attr('src');
      
      // Look for price
      const priceText = $('.price, [itemprop="price"], .special-price, .product-price').first().text().trim();
      
      // Look for JSON-LD
      let hasJsonLd = false;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const content = $(el).html();
          if (content && (content.includes('"Product"') || content.includes('"offers"'))) {
            hasJsonLd = true;
          }
        } catch {}
      });

      console.log(`  Product HTTP:       ${pRes.status}`);
      console.log(`  Title Extracted:    "${title.slice(0, 50)}"`);
      console.log(`  Image Extracted:    "${image?.slice(0, 60) || 'None'}"`);
      console.log(`  Price Extracted:    "${priceText.slice(0, 30) || 'None'}"`);
      console.log(`  Has JSON-LD:        ${hasJsonLd}`);
    } catch (e: any) {
      console.log(`  Product Fetch:      Failed (${e.response?.status || e.message})`);
    }
  }
}

async function main() {
  for (const c of CANDIDATES) {
    await testCandidate(c);
  }
}

main().catch(console.error);
