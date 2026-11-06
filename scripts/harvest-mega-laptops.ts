import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function harvestMegaLinks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const brandUrls = [
    'https://www.mega.pk/laptop-apple/',
    'https://www.mega.pk/laptop-lenovo/',
    'https://www.mega.pk/laptop-hp/',
    'https://www.mega.pk/laptop-dell/',
    'https://www.mega.pk/laptop-price-pakistan/2/',
    'https://www.mega.pk/laptop-price-pakistan/3/',
  ];

  const harvested: { cat: string; url: string; title: string }[] = [];
  const seen = new Set<string>();

  for (const bUrl of brandUrls) {
    console.log(`Crawling ${bUrl}...`);
    try {
      await page.goto(bUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      const $ = cheerio.load(html);

      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('_products/') || href.includes('-price-pakistan.html')) && !href.includes('/category/')) {
          const full = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          if (!seen.has(full)) {
            seen.add(full);
            const title = $(el).text().trim() || $(el).attr('title') || '';
            harvested.push({ cat: 'laptops', url: full, title });
          }
        }
      });
    } catch (e: any) {
      console.error(bUrl, e.message);
    }
  }

  await browser.close();
  console.log(`Harvested ${harvested.length} unique laptop URLs.`);
  fs.writeFileSync('scratch/mega-laptops-harvested.json', JSON.stringify(harvested, null, 2), 'utf8');
}

harvestMegaLinks().catch(console.error);
