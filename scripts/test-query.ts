import axios from 'axios';
import * as cheerio from 'cheerio';

async function test(q: string) {
  const url = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(q)}`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  console.log(`Shophive search for "${q}":`);
  $('a.product-item-link').each((_, el) => {
    console.log(' -', $(el).text().trim().replace(/\s+/g, ' '), '->', $(el).attr('href'));
  });
}

test('HP ProBook 450 G9').then(() => test('Dell Latitude 3540'));
