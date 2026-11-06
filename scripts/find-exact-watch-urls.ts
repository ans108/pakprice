import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';

async function findExactUrls() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.mega.pk/watches/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const html = await page.content();
  const $ = cheerio.load(html);

  const scraper = new MegaPkScraper();
  const targetNames = ['Xiaomi Mi Smart Band 10', 'Samsung Galaxy Watch 8 40mm'];

  const found: any[] = [];
  const urls: string[] = [];
  $('a[href*="_products/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !urls.includes(href)) urls.push(href);
  });

  for (const u of urls) {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const pHtml = await page.content();
    const ext = scraper.extractFromHtml(pHtml, u);
    if (ext && targetNames.includes(ext.name)) {
      found.push({ name: ext.name, url: u, price: ext.price });
      console.log(`FOUND: "${ext.name}" -> ${u} (PKR ${ext.price})`);
    }
  }

  await browser.close();
  console.log('Results:', found);
}

findExactUrls().catch(console.error);
