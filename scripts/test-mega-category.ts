import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '@pakprice/shared';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testMega() {
  try {
    const res = await axios.get('https://www.mega.pk/mobiles/', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('div[id*="lap_"], .product-item, .item, tr').each((_, el) => {
      const a = $(el).find('a[href*="-price-pakistan.html"], a[href*="_products/"]');
      const title = a.text().trim();
      const href = a.attr('href');
      const priceText = $(el).find('.price, .lap_price, [class*="price"]').text().trim();
      if (title && href && priceText) {
        items.push({ title, href, priceText, price: parsePrice(priceText) });
      }
    });
    console.log(`Found ${items.length} items with prices on Mega.pk mobiles:`, items.slice(0, 5));
  } catch (e: any) {
    console.error(e.message);
  }
}

testMega();

