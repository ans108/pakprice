import axios from 'axios';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import fs from 'fs';

async function testExtract() {
  const candidates: any[] = JSON.parse(fs.readFileSync('scripts/shophive-candidates-6g.json', 'utf8'));
  const scraper = new ShophiveScraper();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  let valid = 0;
  let invalid = 0;

  for (const c of candidates.slice(0, 15)) {
    try {
      const res = await axios.get(c.url, { headers, timeout: 15000 });
      const extracted = scraper.extractProductFromHtml(res.data, c.url, c.categorySlug || 'mobiles');
      if (extracted) {
        const validated = scraper.validateProduct(extracted);
        if (validated) {
          console.log(`✅ [${c.category}] "${validated.name}" | Price: Rs. ${validated.price} | InStock: ${validated.inStock} | ID: ${validated.sourceIdentifier} (${validated.sourceIdentifierType})`);
          valid++;
        } else {
          console.log(`⚠️ Schema validation failed (e.g. price < 500): ${c.url} - price=${extracted.price}`);
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

  console.log(`\nShophive Sample test: ${valid} valid, ${invalid} invalid`);
}

testExtract().catch(console.error);
