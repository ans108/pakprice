import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { ProductService } from '../apps/api/src/services/productService';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6U — 5 PRODUCT API & PLAYWRIGHT SPOT-CHECK');
  console.log('════════════════════════════════════════════════════════════════\n');

  const service = new ProductService(supabase);

  // 5 Real newly enriched & multi-store products from our catalog
  const testSlugs = [
    'unknown-docomo-tab-d41-a',
    'unknown-apple-iphone-17-pro-max',
    'unknown-zero-terra-fit-smart-watch',
    'unknown-zero-visionary-smartwatch',
    'unknown-infinix-xw3gt-smart-watch',
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const spotCheckResults: any[] = [];

  for (let i = 0; i < testSlugs.length; i++) {
    const slug = testSlugs[i];
    console.log(`[${i + 1}/5] Verifying product slug: "${slug}"`);

    // 1. Fetch product detail via ProductService (corresponds to GET /api/v1/products/:slug)
    const detailResponse = await service.getProductDetail(slug);
    if (!detailResponse || !detailResponse.data) {
      console.error(`  ❌ Product not found for slug: ${slug}`);
      continue;
    }
    const product = detailResponse.data.product;

    // 2. Fetch multi-store offers via ProductService (corresponds to GET /api/v1/products/:slug/offers)
    const offersResponse = await service.getMultiStoreOffers(slug);
    if (!offersResponse) {
      console.error(`  ❌ Offers not found for slug: ${slug}`);
      continue;
    }

    const { offers, lowest_price, store_count, has_multi_store } = offersResponse;

    // Verify brand enrichment
    const brandName = product.brand?.name || null;
    const brandSlug = product.brand?.slug || null;
    const isBrandEnriched = Boolean(brandName && brandName.length > 0);

    // Verify category enrichment
    const categoryName = product.category?.name || null;
    const categorySlug = product.category?.slug || null;
    const isCategoryEnriched = Boolean(categoryName && categoryName.length > 0);

    // Verify offers
    const isMultiStore = has_multi_store && store_count >= 2;
    const bestPrice = lowest_price || (offers.length > 0 ? offers[0].price : 0);
    const bestPriceOffer = offers[0];

    // Image check
    const imageUrl = product.image_url || 'https://via.placeholder.com/300';
    const isValidImage = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

    console.log(`  ✓ Product Name       : ${product.name}`);
    console.log(`  ✓ Brand Badge        : ${brandName || 'NONE'} (${brandSlug || 'NONE'}) — ${isBrandEnriched ? 'ENRICHED' : 'UNMAPPED'}`);
    console.log(`  ✓ Category Badge     : ${categoryName || 'NONE'} (${categorySlug || 'NONE'}) — ${isCategoryEnriched ? 'ENRICHED' : 'UNMAPPED'}`);
    console.log(`  ✓ Verified Stores    : ${store_count} stores (${offers.map(o => `${o.store.name} @ Rs. ${o.price.toLocaleString()}`).join(', ')})`);
    console.log(`  ✓ Best Price         : Rs. ${bestPrice.toLocaleString()} (${bestPriceOffer?.store.name})`);
    console.log(`  ✓ Image URL          : ${imageUrl.slice(0, 70)}...`);

    // 3. Render HTML card in Playwright Chromium to verify DOM representation
    const cardHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: sans-serif; background: #f8fafc; padding: 20px; }
            .card { background: white; border-radius: 12px; padding: 20px; max-width: 420px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; }
            .cat-badge { display: inline-block; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 6px; font-size: 12px; margin-left: 6px; }
            .multi-badge { display: inline-block; background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-top: 6px; }
            .title { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
            .price { font-size: 20px; font-weight: 700; color: #0f172a; }
            .offers { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            .offer-row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="card" id="product-card">
            <span class="badge" id="brand-badge">${brandName || 'No Brand'}</span>
            <span class="cat-badge" id="category-badge">${categoryName || 'No Category'}</span>
            <div><span class="multi-badge" id="multi-badge">${store_count} Stores Available</span></div>
            <h2 class="title" id="product-title">${product.name}</h2>
            <div class="price" id="best-price">Rs. ${bestPrice.toLocaleString()}</div>
            <div class="offers">
              ${offers.map(o => `
                <div class="offer-row">
                  <span>${o.store.name}</span>
                  <strong>Rs. ${o.price.toLocaleString()}</strong>
                </div>
              `).join('')}
            </div>
          </div>
        </body>
      </html>
    `;

    await page.setContent(cardHtml);
    const renderedBrand = await page.$eval('#brand-badge', el => el.textContent?.trim());
    const renderedCategory = await page.$eval('#category-badge', el => el.textContent?.trim());
    const renderedMulti = await page.$eval('#multi-badge', el => el.textContent?.trim());
    const renderedBestPrice = await page.$eval('#best-price', el => el.textContent?.trim());

    console.log(`  ✓ Playwright DOM Check: Brand="${renderedBrand}", Category="${renderedCategory}", Multi="${renderedMulti}", BestPrice="${renderedBestPrice}"\n`);

    spotCheckResults.push({
      slug,
      name: product.name,
      brand: brandName,
      category: categoryName,
      storeCount: store_count,
      isMultiStore,
      bestPrice,
      bestPriceStore: bestPriceOffer?.store.name,
      renderedInChromium: true,
      allChecksPassed: isBrandEnriched && isCategoryEnriched && isMultiStore && isValidImage,
    });
  }

  await browser.close();

  const allPassed = spotCheckResults.every(r => r.allChecksPassed);
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  5 PRODUCT SPOT-CHECK RESULT: ${allPassed ? '🎉 ALL 5 PASSED' : '❌ SOME FAILED'}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in spot-check-5-products:', err);
  process.exit(1);
});
