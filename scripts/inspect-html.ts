import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function inspectHTML() {
  // 1. HomeShopping category URL
  console.log('Fetching HomeShopping /mobile-phone---tablets/mobile-phones ...');
  try {
    const res = await axios.get('https://homeshopping.pk/mobile-phone---tablets/mobile-phones', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    fs.writeFileSync('scripts/scratch_hs.html', res.data);
    const $ = cheerio.load(res.data);
    console.log('HS Title:', $('title').text());
    
    // Check for state / JSON in script tags
    $('script').each((i, el) => {
      const type = $(el).attr('type') || '';
      const id = $(el).attr('id') || '';
      const text = $(el).text();
      if (type.includes('json') || id.includes('state') || id.includes('data') || text.includes('productName') || text.includes('productId')) {
        console.log(`HS Script ${i}: type="${type}", id="${id}", len=${text.length}, preview=${text.slice(0, 150)}`);
      }
    });

    // Check all product links
    const productLinks: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/p') || href.includes('/product') || href.includes('/pr/')) {
        productLinks.push(href);
      }
    });
    console.log(`HS product links found: ${productLinks.length}`, productLinks.slice(0, 5));
  } catch (e: any) {
    console.log('HS error:', e.message);
  }

  // 2. Naheed search
  console.log('\nFetching Naheed search ...');
  try {
    const res = await axios.get('https://www.naheed.pk/catalogsearch/result/?q=tea', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    fs.writeFileSync('scripts/scratch_naheed.html', res.data);
    const $ = cheerio.load(res.data);
    console.log('Naheed Title:', $('title').text());
    
    // Let's find product links in Naheed
    const naheedLinks: { text: string; href: string }[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.endsWith('.html') && !href.includes('/customer/') && !href.includes('/catalogsearch/') && !href.includes('/checkout/')) {
        naheedLinks.push({ text: text.slice(0, 40), href });
      }
    });
    console.log(`Naheed .html links found: ${naheedLinks.length}`, naheedLinks.slice(0, 6));

    // Look for prices in Naheed
    console.log('Naheed price tags count:', $('[data-price-type], .price, [class*="price"]').length);
    $('[data-price-type], .price').slice(0, 5).each((_, el) => {
      console.log('Price tag:', $(el).text().trim());
    });
  } catch (e: any) {
    console.log('Naheed error:', e.message);
  }
}

inspectHTML();
