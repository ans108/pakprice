import axios from 'axios';
import * as cheerio from 'cheerio';

async function testPriceOye(query: string) {
  try {
    const url = `https://priceoye.pk/search?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const results: Array<{ title: string; url: string; price: string }> = [];

    // Check product cards on PriceOye search result page
    $('.productBox, .product-list .product-item, a.product-card, .p-card, a[href*="priceoye.pk/mobiles/"]').each((_, el) => {
      const a = $(el).is('a') ? $(el) : $(el).find('a').first();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) {
        href = 'https://priceoye.pk' + (href.startsWith('/') ? '' : '/') + href;
      }
      const title = $(el).find('.p-title, .product-name, h4, h3, .name').text().trim() || a.text().trim();
      const price = $(el).find('.price-box, .price, .p-price').text().trim();
      if (href && title && (href.includes('/mobiles/') || href.includes('/smart-watches/') || href.includes('/laptops/'))) {
        results.push({ title, url: href, price });
      }
    });

    console.log(`PriceOye search "${query}": found ${results.length} results.`);
    results.slice(0, 3).forEach(r => console.log(`  - [${r.title}] -> ${r.url} (${r.price})`));
    return results;
  } catch (err: any) {
    console.error(`PriceOye search failed:`, err.message);
    return [];
  }
}

async function testTelemart(query: string) {
  try {
    // Try Shopify suggest API first
    const suggestUrl = `https://www.telemart.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`;
    const res = await axios.get(suggestUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const products = res.data?.resources?.results?.products || [];
    console.log(`Telemart suggest "${query}": found ${products.length} products.`);
    products.slice(0, 3).forEach((p: any) => console.log(`  - [${p.title}] -> https://www.telemart.pk${p.url} (Rs. ${p.price})`));
    return products;
  } catch (err: any) {
    console.error(`Telemart search failed:`, err.message);
    return [];
  }
}

async function testMegaPk(query: string) {
  try {
    const url = `https://www.mega.pk/search/${encodeURIComponent(query)}/`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const results: Array<{ title: string; url: string; price: string }> = [];

    $('#lap_list li, .lap_list li, .cat_lap_item, div[id^="lap_item"]').each((_, el) => {
      const a = $(el).find('a').first();
      let href = a.attr('href') || '';
      if (href && !href.startsWith('http')) {
        href = 'https://www.mega.pk' + (href.startsWith('/') ? '' : '/') + href;
      }
      const title = $(el).find('h4, h3, .lap_title, [id^="title_"]').text().trim();
      const price = $(el).find('.lap_price, .price, [id^="price_"]').text().trim();
      if (href && title) {
        results.push({ title, url: href, price });
      }
    });

    console.log(`Mega.pk search "${query}": found ${results.length} products.`);
    results.slice(0, 3).forEach(r => console.log(`  - [${r.title}] -> ${r.url} (${r.price})`));
    return results;
  } catch (err: any) {
    console.error(`Mega.pk search failed:`, err.message);
    return [];
  }
}

async function testShophive(query: string) {
  try {
    const url = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const results: Array<{ title: string; url: string; price: string }> = [];

    $('.product-item, .item.product').each((_, el) => {
      const a = $(el).find('a.product-item-link, a.product-item-photo').first();
      const href = a.attr('href') || '';
      const title = $(el).find('.product-item-name, a.product-item-link').text().trim();
      const price = $(el).find('[data-price-type="finalPrice"] .price, .price-wrapper .price').text().trim();
      if (href && title) {
        results.push({ title, url: href, price });
      }
    });

    console.log(`Shophive search "${query}": found ${results.length} products.`);
    results.slice(0, 3).forEach(r => console.log(`  - [${r.title}] -> ${r.url} (${r.price})`));
    return results;
  } catch (err: any) {
    console.error(`Shophive search failed:`, err.message);
    return [];
  }
}

async function main() {
  console.log('=== Testing Tier-1 Store Search Connectors ===\n');
  await testPriceOye('Galaxy A07');
  console.log('');
  await testTelemart('Galaxy A07');
  console.log('');
  await testMegaPk('Galaxy A07');
  console.log('');
  await testShophive('Galaxy A07');
}

main().catch(console.error);
