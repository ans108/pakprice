import axios from 'axios';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

async function testMatch() {
  const url = 'https://www.shophive.com/samsung-galaxy-watch-ultra-47mm/';
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const scraper = new ShophiveScraper();
  const scraped = scraper.extractProductFromHtml(res.data, url, 'smart-watches');

  console.log('Extracted Shophive product:', {
    name: scraped?.name,
    price: scraped?.price,
    brand: scraped?.brand,
    sku: scraped?.sku,
    sourceIdentifier: scraped?.sourceIdentifier,
  });

  if (scraped) {
    const matcher = new ProductMatcher();
    // Shophive store ID: de523ed0-125c-4650-8695-8eac52a38752
    const matchRes = await matcher.match(scraped, 'de523ed0-125c-4650-8695-8eac52a38752');
    console.log('Match Result:', {
      status: matchRes.status,
      method: matchRes.method,
      confidence: matchRes.confidence,
      productName: matchRes.product?.name,
      productId: matchRes.product?.id,
      variantName: matchRes.variant?.name,
      reason: matchRes.reason,
    });
  }
}

testMatch().catch(console.error);
