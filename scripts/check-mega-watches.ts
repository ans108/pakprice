import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function checkSmartwatches() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const urls = [
    'https://www.mega.pk/smart-watches-price-pakistan/',
    'https://www.mega.pk/smartwatch-price-pakistan/',
    'https://www.mega.pk/watches/',
    'https://www.mega.pk/smartwatches/',
    'https://www.mega.pk/tablets-price-pakistan/',
    'https://www.mega.pk/tablets/',
  ];

  for (const u of urls) {
    try {
      const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 });
      console.log(u, 'status:', resp?.status(), 'currentUrl:', page.url());
      const html = await page.content();
      const $ = cheerio.load(html);
      const links: string[] = [];
      $('a[href*="_products/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !links.includes(href)) links.push(href);
      });
      console.log('  Products found:', links.length);
      links.slice(0, 5).forEach(l => console.log('    -', l));
    } catch (e: any) {
      console.error(u, e.message);
    }
  }

  await browser.close();
}

checkSmartwatches().catch(console.error);
