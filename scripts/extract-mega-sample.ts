import axios from 'axios';
import * as cheerio from 'cheerio';

async function extractMegaLinks() {
  const url = 'https://www.mega.pk/smartwatches/';
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    timeout: 10000,
  });

  const $ = cheerio.load(res.data);
  const items: Array<{ title: string; href: string; price: string }> = [];

  // Look for product cards / links
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html')) {
      const full = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
      const title = $(el).text().trim() || $(el).attr('title') || '';
      if (title.length > 3 && !items.some(i => i.href === full)) {
        items.push({ title, href: full, price: '' });
      }
    }
  });

  console.log(`Found ${items.length} products on ${url}`);
  for (const it of items.slice(0, 15)) {
    console.log(`  - "${it.title}" => ${it.href}`);
  }
}

extractMegaLinks().catch(console.error);

