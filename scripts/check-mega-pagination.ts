import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function checkPagination() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.mega.pk/laptop-price-pakistan/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const html = await page.content();
  const $ = cheerio.load(html);
  
  console.log('Pagination links on laptop-price-pakistan:');
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('page') || href.includes('laptop') || text.match(/^\d+$/))) {
      console.log('  ', text, '->', href);
    }
  });

  await browser.close();
}

checkPagination().catch(console.error);
