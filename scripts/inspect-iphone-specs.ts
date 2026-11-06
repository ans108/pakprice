import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper.js';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper.js';
import axios from 'axios';

async function testScrapers() {
  console.log('=== TESTING SPEC EXTRACTION ON IPHONE 17 PRO MAX ===\n');

  const megaScraper = new MegaPkScraper();
  const priceoyeScraper = new PriceOyeScraper();

  const megaUrl = 'https://www.mega.pk/mobiles_products/26774/Apple-iPhone-17-Pro-Max.html';
  const priceoyeUrl = 'https://priceoye.pk/mobiles/apple/apple-iphone-17-pro-max';

  try {
    const resMega = await axios.get(megaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const megaProd = megaScraper.extractFromHtml(resMega.data, megaUrl);
    console.log('Mega.pk Scraped Product:');
    console.log({
      name: megaProd?.name,
      price: megaProd?.price,
      ramGb: megaProd?.ramGb,
      storageGb: megaProd?.storageGb,
      color: megaProd?.color,
      modelNumber: megaProd?.modelNumber,
      sku: megaProd?.sku,
      sourceIdentifier: megaProd?.sourceIdentifier
    });
  } catch (err: any) {
    console.error('Mega.pk error:', err.message);
  }

  try {
    const resPo = await axios.get(priceoyeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const poProd = priceoyeScraper.extractFromHtml(resPo.data, priceoyeUrl);
    console.log('\nPriceOye Scraped Product:');
    console.log({
      name: poProd?.name,
      price: poProd?.price,
      ramGb: poProd?.ramGb,
      storageGb: poProd?.storageGb,
      color: poProd?.color,
      modelNumber: poProd?.modelNumber,
      sku: poProd?.sku,
      sourceIdentifier: poProd?.sourceIdentifier
    });
  } catch (err: any) {
    console.error('PriceOye error:', err.message);
  }
}

testScrapers().catch(console.error);
