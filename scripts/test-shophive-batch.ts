import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testShophiveBatch() {
  const products = [
    'Samsung Galaxy A07',
    'Audionic Airbud 730',
    'Infinix Smart 20',
    'Kieslect Kr',
    'Mibro T1',
    'Apple iPhone 17'
  ];

  for (const p of products) {
    try {
      const url = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(p)}`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 8000,
        validateStatus: () => true
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        const items: any[] = [];
        $('.product-item-info, .item.product').each((_, el) => {
          const a = $(el).find('a.product-item-link');
          const title = a.text().trim();
          const href = a.attr('href');
          const price = $(el).find('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price').first().text().trim();
          if (title && href) items.push({ title, href, price });
        });
        console.log(`[Shophive] Query "${p}" -> ${items.length} items`);
        for (const it of items.slice(0, 2)) {
          console.log(`   - ${it.title} | Price: ${it.price} | URL: ${it.href}`);
        }
      }
    } catch (e: any) {
      console.log(`[Shophive] Error for "${p}":`, e.message);
    }
  }
}

testShophiveBatch();

