import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '../apps/scraper/src/utils/scraperUtils';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testIShopping(query: string) {
  try {
    const url = `https://www.ishopping.pk/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('.product-item-info, .item.product, .product-item').each((_, el) => {
      const a = $(el).find('a.product-item-link, a.product-image');
      const title = a.attr('title') || $(el).find('.product-item-name, h2, h3').text().trim() || a.text().trim();
      const href = a.attr('href');
      const priceText = $(el).find('[data-price-type="finalPrice"] .price, .special-price .price, .regular-price .price, .price').first().text().trim();
      const price = parsePrice(priceText);
      if (href && title && price) {
        items.push({ title: title.replace(/\s+/g, ' ').trim(), url: href, price });
      }
    });
    console.log(`iShopping found ${items.length} items for "${query}"! Sample:`, items.slice(0, 3));
  } catch (e: any) {
    console.error('iShopping error:', e.message);
  }
}

testIShopping('Zero');
testIShopping('Audionic');
testIShopping('Samsung Galaxy');
testIShopping('Infinix');

