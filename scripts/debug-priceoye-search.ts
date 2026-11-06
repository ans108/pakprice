import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('priceoye_search.html', 'utf8');
const $ = cheerio.load(html);

console.log('=== PriceOye Search Results ===');
$('a[href*="/mobiles/"]').each((_, el) => {
  const href = $(el).attr('href') || '';
  const text = $(el).text().trim().replace(/\s+/g, ' ');
  if (href.split('/').length >= 5 && text) {
    console.log(`${href} -> ${text.slice(0, 80)}`);
  }
});
