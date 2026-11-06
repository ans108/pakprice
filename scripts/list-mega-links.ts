import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function listAllMegaLinks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const categories = [
    { cat: 'mobiles', url: 'https://www.mega.pk/mobiles/' },
    { cat: 'laptops', url: 'https://www.mega.pk/laptop-price-pakistan/' },
    { cat: 'tablets', url: 'https://www.mega.pk/tablets/' },
  ];

  const allItems: { cat: string; url: string; title: string }[] = [];
  const seen = new Set<string>();

  for (const c of categories) {
    console.log(`Fetching ${c.url}...`);
    try {
      await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      const $ = cheerio.load(html);

      // Mega.pk product listings often have .featured-cat or #product_list or .product_list
      // Let's inspect all a tags with _products/
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('_products/') || href.includes('-price-pakistan.html')) && !href.includes('/category/')) {
          const full = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          if (!seen.has(full)) {
            seen.add(full);
            let title = $(el).text().trim() || $(el).attr('title') || '';
            allItems.push({ cat: c.cat, url: full, title });
          }
        }
      });
    } catch (e: any) {
      console.error(e.message);
    }
  }

  await browser.close();

  console.log(`Total unique product URLs: ${allItems.length}`);
  fs.writeFileSync('scratch/all-mega-links.json', JSON.stringify(allItems, null, 2), 'utf8');
  console.log('Saved scratch/all-mega-links.json');
}

listAllMegaLinks().catch(console.error);
