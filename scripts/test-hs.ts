import axios from 'axios';
import * as cheerio from 'cheerio';
import { parsePrice } from '@pakprice/shared';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testHS() {
  try {
    const res = await axios.get('https://www.homeshopping.pk/search.php?search_query=Samsung+Galaxy', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });
    const $ = cheerio.load(res.data);
    console.log('HS title:', $('title').text());
    const items: any[] = [];
    $('.product-item, .product-box, .product, .item, [data-product-id]').each((_, el) => {
      const title = $(el).find('a.title, .product-name, h5 a, h4 a, .product-title').text().trim();
      const href = $(el).find('a').attr('href');
      const price = $(el).find('.price, .product-price').text().trim();
      if (title && href) items.push({ title, href, price });
    });
    console.log(`HS found ${items.length} items:`, items.slice(0, 3));
  } catch (e: any) {
    console.error('HS error:', e.message);
  }
}

testHS();

