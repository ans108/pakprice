import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function fetchFixture() {
  const url = 'https://priceoye.pk/mobiles/samsung/samsung-galaxy-a07';
  console.log('Fetching', url);
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
    timeout: 15000,
  });
  const outPath = path.resolve('apps/scraper/src/__tests__/fixtures/priceoye_product.html');
  fs.writeFileSync(outPath, res.data, 'utf8');
  console.log('Saved priceoye_product.html fixture, size:', res.data.length);
}

fetchFixture().catch(console.error);
