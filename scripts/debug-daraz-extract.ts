import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';
import fs from 'fs';

async function testDarazExtraction() {
  const url = 'https://www.daraz.pk/products/2-3-32-3000-i1968648084.html';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  const html = await res.text();
  const s = new DarazScraper();
  const p = s.extractFromHtml(html, url);
  console.log('Result:', p);
}
testDarazExtraction().catch(console.error);
