import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/web/.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

import sitemap from '../apps/web/src/app/sitemap';

async function main() {
  console.log('Running sitemap()...');
  const urls = await sitemap();
  console.log(`TOTAL SITEMAP ENTRIES: ${urls.length}`);
  const productUrls = urls.filter((u) => u.url.includes('/products/'));
  const staticUrls = urls.filter((u) => !u.url.includes('/products/'));
  console.log(`STATIC URLS COUNT: ${staticUrls.length}`);
  console.log(`PRODUCT URLS COUNT: ${productUrls.length}`);
  console.log('Sample Products (first 3):', productUrls.slice(0, 3).map((p) => p.url));
  console.log('Sample Products (last 3):', productUrls.slice(-3).map((p) => p.url));

  if (productUrls.length >= 1295 && staticUrls.length === 5) {
    console.log('✓ SUCCESS: All 1,295 active products + 5 static routes (1,300 total) verified!');
  } else {
    console.warn(`! Product count is ${productUrls.length}, expected 1295`);
  }
}

main().catch(console.error);
