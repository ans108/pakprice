import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper.js';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher.js';
import axios from 'axios';

async function main() {
  const scraper = new TelemartScraper();
  const matcher = new ProductMatcher();

  const url40mm = 'https://www.telemart.pk/collections/mens-watches/products/samsung-galaxy-watch-8-40mm';
  const url46mm = 'https://www.telemart.pk/products/samsung-galaxy-watch-8-classic-46mm';

  console.log('Fetching 40mm page...');
  const res40 = await axios.get(url40mm, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const prod40 = scraper.extractFromHtml(res40.data, url40mm);
  console.log('40mm Product:', prod40);

  console.log('\nFetching 46mm page...');
  const res46 = await axios.get(url46mm, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const prod46 = scraper.extractFromHtml(res46.data, url46mm);
  console.log('46mm Product:', prod46);

  console.log('\nTesting Matcher against Mega.pk 40mm:');
  const mega40mm = {
    name: 'Samsung Galaxy Watch 8 40mm',
    sourceIdentifier: '26849',
    identifierType: 'product_id' as const,
    price: 71999,
    originalPrice: null,
    inStock: true,
    storeSlug: 'mega-pk',
    brand: 'Samsung',
    category: 'watches',
    url: 'https://www.mega.pk/watches_products/26849/Samsung-Galaxy-Watch-8-40mm.html',
    images: [],
    sku: null,
    modelNumber: null
  };

  if (prod40) {
    const matchWith40 = await matcher.match(prod40);
    console.log('Telemart 40mm matched canonical variant:', matchWith40);
  }

  if (prod46) {
    const matchWith46 = await matcher.match(prod46);
    console.log('Telemart 46mm matched canonical variant:', matchWith46);
  }
}

main().catch(console.error);
