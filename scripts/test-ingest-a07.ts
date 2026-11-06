import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testIngestionAndApi() {
  console.log('=== TESTING INGESTION AND OFFERS API VISIBILITY ===\n');
  const scraper = new PriceOyeScraper();
  const url = 'https://priceoye.pk/mobiles/samsung/samsung-galaxy-a07';

  // Fast fetch HTML
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
    timeout: 15000,
  });

  const scraped = scraper.extractProductFromHtml(res.data, url);
  if (!scraped) {
    throw new Error('Failed to extract product');
  }

  const valid = scraper.validateProduct(scraped);
  if (!valid) {
    throw new Error('Scraped product failed schema validation');
  }

  console.log('Validated Scraped Product:');
  console.log(`  Name: ${valid.name}`);
  console.log(`  Price: Rs. ${valid.price}`);
  console.log(`  Original: Rs. ${valid.originalPrice}`);
  console.log(`  Discount: ${valid.discountPercent}%`);
  console.log(`  Brand: ${valid.brand}`);
  console.log(`  Store Identifier: ${valid.sourceIdentifier} (${valid.sourceIdentifierType})`);

  // Lookup PriceOye store ID
  const { data: priceOyeStore } = await supabase
    .from('stores')
    .select('id, name')
    .or('slug.eq.priceoye,scraper_key.eq.priceoye')
    .single();

  if (!priceOyeStore) {
    throw new Error('PriceOye store not found in database');
  }
  console.log(`Found PriceOye store in DB: ${priceOyeStore.name} (${priceOyeStore.id})`);

  // Ingest via PriceIngestionService
  console.log('\nIngesting via PriceIngestionService (allowCreate=false)...');
  const ingestion = new PriceIngestionService();
  const ingestResult = await ingestion.ingest(valid, priceOyeStore.id, false, { allowCreate: false });

  console.log('Ingest Result:');
  console.log(`  Action: ${ingestResult.action}`);
  console.log(`  Product ID: ${ingestResult.productId}`);
  console.log(`  Variant ID: ${ingestResult.variantId}`);
  console.log(`  Price ID: ${ingestResult.priceId}`);
  console.log(`  Match Method: ${ingestResult.matchMethod}`);

  // Check database directly
  const { data: canonicalProd } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      product_variants (
        id,
        prices (
          id,
          price,
          original_price,
          discount_percent,
          product_url,
          stores (name, slug)
        )
      )
    `)
    .eq('id', ingestResult.productId)
    .single();

  console.log('\nDatabase Canonical Product State:');
  console.log(`  Name: "${canonicalProd?.name}"`);
  console.log(`  Slug: "${canonicalProd?.slug}"`);
  console.log('  Offers attached:');
  for (const v of canonicalProd?.product_variants || []) {
    for (const pr of v.prices || []) {
      console.log(`    - Store: ${(pr.stores as any)?.name} | Price: Rs. ${pr.price} | Orig: Rs. ${pr.original_price} | URL: ${pr.product_url}`);
    }
  }

  // Call the live API offers endpoint
  const slug = canonicalProd?.slug;
  const apiRes = await axios.get(`http://localhost:4000/api/v1/products/${slug}/offers`);
  console.log('\nGET /api/v1/products/:slug/offers Response:');
  console.log(`  success: ${apiRes.data.success}`);
  console.log(`  lowest_price: Rs. ${apiRes.data.lowest_price}`);
  console.log(`  store_count: ${apiRes.data.store_count}`);
  console.log(`  has_multi_store: ${apiRes.data.has_multi_store}`);
  console.log('  offers returned by API:');
  for (const o of apiRes.data.offers) {
    console.log(`    * [${o.store.name}] Rs. ${o.price} (Original: Rs. ${o.original_price}, Discount: ${o.discount_percent}%, Status: ${o.availability_status})`);
  }
}

testIngestionAndApi().catch(console.error);
