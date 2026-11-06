import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function testSearch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const queries = ['ThinkPad', 'Samsung Galaxy', 'MacBook Air', 'Infinix', 'T900'];
  for (const q of queries) {
    const url = 'https://www.mega.pk/search/?q=' + encodeURIComponent(q);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      const $ = cheerio.load(html);
      const links: { title: string; href: string }[] = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('_products/') || href.includes('-price-pakistan.html')) && !href.includes('/category/')) {
          const t = $(el).text().trim() || $(el).attr('title') || '';
          if (t && !links.find(l => l.href === href)) {
            links.push({ title: t, href });
          }
        }
      });
      console.log('Query:', q, '-> Found links:', links.length);
      links.slice(0, 3).forEach(l => console.log('  *', l.title, '->', l.href));
    } catch (e: any) {
      console.error('Error on query', q, e.message);
    }
  }
  await browser.close();
}

testSearch().catch(console.error);
