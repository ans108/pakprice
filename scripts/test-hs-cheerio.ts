import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testHsCheerio() {
  const query = 'Samsung Galaxy A05';
  const url = `https://homeshopping.pk/search.php?search_query=${encodeURIComponent(query)}`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 8000,
    validateStatus: () => true
  });
  console.log('HS status:', res.status);
  if (res.status === 200 && typeof res.data === 'string') {
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('.product-box, .product, .ProductDetails, .inner').each((_, el) => {
      const a = $(el).find('a[href*="/products/"]');
      const href = a.attr('href');
      const title = a.text().trim() || $(el).find('img').attr('alt') || '';
      const priceText = $(el).find('.Price, .price').text().trim();
      if (href && title) items.push({ title, href, priceText });
    });
    console.log('Found HS items:', items.slice(0, 5));
    if (items.length === 0) {
      console.log('Checking all links:');
      $('a[href*="/products/"]').slice(0, 5).each((_, el) => {
        console.log('Link:', $(el).attr('href'), $(el).text().trim());
      });
    }
  }
}

testHsCheerio();

