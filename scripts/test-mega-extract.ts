import axios from 'axios';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import fs from 'fs';

async function testExtract() {
  const candidates: any[] = JSON.parse(fs.readFileSync('scripts/mega-candidates-6g.json', 'utf8'));
  const scraper = new MegaPkScraper();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  let valid = 0;
  let invalid = 0;

  for (const c of candidates.slice(0, 10)) {
    try {
      const res = await axios.get(c.url, { headers, timeout: 15000 });
      const extracted = scraper.extractFromHtml(res.data, c.url);
      if (extracted) {
        const validated = scraper.validateProduct(extracted);
        if (validated) {
          console.log(`✅ [${c.category}] "${validated.name}" | Price: Rs. ${validated.price} | InStock: ${validated.inStock} | ID: ${validated.sourceIdentifier}`);
          valid++;
        } else {
          console.log(`⚠️ Schema validation failed: ${c.url}`);
          invalid++;
        }
      } else {
        console.log(`❌ Extraction returned null: ${c.url}`);
        invalid++;
      }
    } catch (e: any) {
      console.log(`❌ Fetch error for ${c.url}: ${e.message}`);
      invalid++;
    }
  }

  console.log(`\nSample test: ${valid} valid, ${invalid} invalid`);
}

testExtract().catch(console.error);
