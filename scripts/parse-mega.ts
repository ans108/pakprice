import fs from 'fs';
import * as cheerio from 'cheerio';
import { parsePrice } from '@pakprice/shared';

const html = fs.readFileSync('mega_mobiles.html', 'utf-8');
const $ = cheerio.load(html);

$('a[href*="_products/"]').each((i, el) => {
  if (i > 10) return;
  const title = $(el).text().trim();
  const href = $(el).attr('href');
  const parent = $(el).closest('tr, div, li');
  const text = parent.text().replace(/\s+/g, ' ');
  console.log(`[${i}] Title: "${title}" | Text: "${text.slice(0, 100)}"`);
});
