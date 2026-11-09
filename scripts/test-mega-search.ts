import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testMegaSearch() {
  const query = 'Samsung Galaxy A07';
  const url = `https://www.mega.pk/search/?q=${encodeURIComponent(query)}`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    timeout: 8000,
    validateStatus: () => true
  });
  console.log('Mega search status:', res.status);
  if (res.status === 200 && typeof res.data === 'string') {
    const $ = cheerio.load(res.data);
    const items: any[] = [];
    $('a[href*="_products/"], a[href*="-price-pakistan.html"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim() || $(el).attr('title') || '';
      if (href && title && !items.some(it => it.href === href)) {
        items.push({ title, href });
      }
    });
    console.log(`Found ${items.length} items on Mega.pk:`, items.slice(0, 3));
  }
}

testMegaSearch();
