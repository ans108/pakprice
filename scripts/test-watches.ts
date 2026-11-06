import axios from 'axios';
import * as cheerio from 'cheerio';

async function test(q: string) {
  const url = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(q)}`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  console.log(`Shophive search for "${q}":`);
  let count = 0;
  $('a.product-item-link').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const href = $(el).attr('href');
    if (text && !text.includes('Strap') && !text.includes('Band') && !text.includes('Case') && !text.includes('Glass')) {
      console.log(' -', text, '->', href);
      count++;
    }
  });
  if (count === 0) console.log(' (No watch devices found)');
}

async function run() {
  await test('Apple Watch Ultra');
  await test('Galaxy Watch Ultra');
  await test('Apple Watch Series');
}

run().catch(console.error);
