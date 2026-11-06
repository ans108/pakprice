import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function inspectForm() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.mega.pk/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const html = await page.content();
  const $ = cheerio.load(html);
  $('form').each((i, el) => {
    console.log('Form', i, 'action:', $(el).attr('action'), 'method:', $(el).attr('method'));
    $(el).find('input').each((j, inp) => {
      console.log('  Input:', $(inp).attr('name'), $(inp).attr('type'), $(inp).attr('placeholder'));
    });
  });
  await browser.close();
}

inspectForm().catch(console.error);
