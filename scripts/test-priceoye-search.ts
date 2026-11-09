import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '../apps/scraper/src/utils/scraperUtils';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testPriceOye() {
  try {
    const url = 'https://priceoye.pk/search?q=Samsung';
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('.product-box, a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"]').each((_, el) => {
      const a = $(el).is('a') ? $(el) : $(el).find('a').first();
      const href = a.attr('href');
      if (href) {
        const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
        const title = a.find('img').attr('alt') || a.find('.p-title, .title').text().trim() || a.text().trim();
        const priceText = $(el).find('.price-box, .price').first().text().trim();
        const price = parsePrice(priceText);
        if (title && price && !items.some(i => i.url === fullUrl)) {
          items.push({ title, url: fullUrl, price });
        }
      }
    });
    console.log(`SUCCESS! PriceOye found ${items.length} products! Sample:`, items.slice(0, 3));
  } catch (e: any) {
    console.error('PriceOye error:', e.message);
  }
}

testPriceOye();
