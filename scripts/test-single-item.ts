import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '../apps/scraper/src/utils/scraperUtils';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testShophive() {
  try {
    const url = 'https://www.shophive.com/catalogsearch/result/?q=Samsung+Galaxy';
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('.product-item-info, .item.product').each((_, el) => {
      const a = $(el).find('a.product-item-link');
      const title = a.text().trim();
      const href = a.attr('href');
      const priceText = $(el).find('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price').first().text().trim();
      const price = parsePrice(priceText);
      if (href && title && price) {
        items.push({ title, url: href, price });
      }
    });
    console.log(`SUCCESS! Shophive found ${items.length} products! Sample:`, items.slice(0, 3));
  } catch (e: any) {
    console.error('Shophive error:', e.message);
  }
}

testShophive();
