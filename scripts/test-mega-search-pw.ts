import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function testMega() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    const query = 'Galaxy A07';
    const url = `https://www.mega.pk/search/${encodeURIComponent(query)}/`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const content = await page.content();
    const $ = cheerio.load(content);
    console.log('Title:', $('title').text());
    const items: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('-price-pakistan.html') || href.includes('_products/')) {
        items.push(href);
      }
    });
    console.log(`Mega.pk found ${items.length} candidate links`);
    items.slice(0, 5).forEach(l => console.log(' -', l));
  } catch (err: any) {
    console.error('Mega.pk error:', err.message);
  } finally {
    await browser.close();
  }
}

testMega().catch(console.error);
