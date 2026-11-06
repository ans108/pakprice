import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { AlFatahScraper } from '../apps/scraper/src/scrapers/stores/AlFatahScraper';
import { NaheedScraper } from '../apps/scraper/src/scrapers/stores/NaheedScraper';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testAlFatah() {
  console.log('\n======================================================');
  console.log('--- TESTING AL-FATAH LIVE DISCOVERY & EXTRACTION ---');
  console.log('======================================================');

  const { data: store } = await supabase.from('stores').select('*').eq('slug', 'al-fatah').single();
  if (!store) throw new Error('Al-Fatah store not found in DB');

  const scraper = new AlFatahScraper();
  const ingestionService = new PriceIngestionService();

  // Test live WooCommerce Store API
  const apiUrl = 'https://www.alfatah.com.pk/wp-json/wc/store/v1/products?per_page=5';
  console.log(`Fetching live products from: ${apiUrl}`);
  const res = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000
  });

  const rawProducts = res.data;
  console.log(`Fetched ${rawProducts.length} raw products from Al-Fatah Store API`);

  const results: any[] = [];

  for (let i = 0; i < Math.min(3, rawProducts.length); i++) {
    const raw = rawProducts[i];
    const extracted = scraper.extractProductFromJson(raw, 'household-groceries');
    if (!extracted) {
      console.log(`Failed to extract product for index ${i}`);
      continue;
    }

    console.log(`\n[Al-Fatah #${i + 1}]`);
    console.log(`Title: "${extracted.name}"`);
    console.log(`URL: ${extracted.sourceUrl}`);
    console.log(`Price: PKR ${extracted.price}, original: ${extracted.originalPrice}, inStock: ${extracted.inStock}`);
    console.log(`Identifier: ${extracted.sourceIdentifier} (${extracted.sourceIdentifierType})`);

    // Price validation
    const validation = validatePrice({
      price: extracted.price,
      originalPrice: extracted.originalPrice ?? null,
      discountPercent: extracted.discountPercent ?? null,
      shippingFee: extracted.shippingFee ?? null,
      inStock: extracted.inStock,
      stockCount: extracted.stockCount ?? null,
      previousPrice: null,
      previousOriginalPrice: null,
    });
    console.log(`PriceValidator: action=${validation.action}, warnings=${JSON.stringify(validation.warnings)}`);

    // Ingest with allowCreate: true (Discovery mode)
    const ingestRes1 = await ingestionService.ingest(extracted, store.id, false, { allowCreate: true });
    console.log(`Ingest 1: action=${ingestRes1.action}, variantId=${ingestRes1.variantId}`);

    // Test Deduplication: Ingest SAME product immediately again
    const ingestRes2 = await ingestionService.ingest(extracted, store.id, false, { allowCreate: false });
    console.log(`Ingest 2 (Deduplication test): action=${ingestRes2.action}, variantId=${ingestRes2.variantId}`);

    // Verify DB persistence
    const { data: priceRow } = await supabase
      .from('prices')
      .select('*, product_variants(id, product_id, products(id, name, slug))')
      .eq('variant_id', ingestRes1.variantId)
      .eq('store_id', store.id)
      .single();

    console.log(`DB Price Record ID: ${priceRow?.id}`);
    console.log(`Associated Canonical Product: ${priceRow?.product_variants?.products?.name} (slug: ${priceRow?.product_variants?.products?.slug})`);

    results.push({
      store: 'al-fatah',
      title: extracted.name,
      url: extracted.sourceUrl,
      price: extracted.price,
      inStock: extracted.inStock,
      validation: validation.action,
      ingest1Action: ingestRes1.action,
      ingest2Action: ingestRes2.action,
      persistedPriceId: priceRow?.id,
      canonicalSlug: priceRow?.product_variants?.products?.slug
    });
  }

  return results;
}

async function testNaheed() {
  console.log('\n======================================================');
  console.log('--- TESTING NAHEED LIVE DISCOVERY & EXTRACTION ---');
  console.log('======================================================');

  const { data: store } = await supabase.from('stores').select('*').eq('slug', 'naheed').single();
  if (!store) throw new Error('Naheed store not found in DB');

  const scraper = new NaheedScraper();
  const ingestionService = new PriceIngestionService();

  // Test live category page
  const categoryUrl = 'https://www.naheed.pk/groceries-pets';
  console.log(`Fetching live category page: ${categoryUrl}`);
  const catRes = await axios.get(categoryUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 20000
  });

  const cheerio = await import('cheerio');
  const $ = cheerio.load(catRes.data);
  const links: string[] = [];
  $('.product-item-link, a.product-item-photo').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http') && !links.includes(href)) {
      links.push(href);
    }
  });

  console.log(`Found ${links.length} product links on Naheed category page`);
  const testLinks = links.slice(0, 3);

  const results: any[] = [];

  for (let i = 0; i < testLinks.length; i++) {
    const link = testLinks[i];
    console.log(`\n[Naheed #${i + 1}] Fetching PDP: ${link}`);
    const pdpRes = await axios.get(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });

    const extracted = scraper.extractProductFromHtml(pdpRes.data, link, 'groceries-pets');
    if (!extracted) {
      console.log(`Failed to extract product for ${link}`);
      continue;
    }

    console.log(`Title: "${extracted.name}"`);
    console.log(`Price: PKR ${extracted.price}, original: ${extracted.originalPrice}, inStock: ${extracted.inStock}`);
    console.log(`Identifier: ${extracted.sourceIdentifier} (${extracted.sourceIdentifierType})`);

    // Price validation
    const validation = validatePrice({
      price: extracted.price,
      originalPrice: extracted.originalPrice ?? null,
      discountPercent: extracted.discountPercent ?? null,
      shippingFee: extracted.shippingFee ?? null,
      inStock: extracted.inStock,
      stockCount: extracted.stockCount ?? null,
      previousPrice: null,
      previousOriginalPrice: null,
    });
    console.log(`PriceValidator: action=${validation.action}, warnings=${JSON.stringify(validation.warnings)}`);

    // Ingest with allowCreate: true
    const ingestRes1 = await ingestionService.ingest(extracted, store.id, false, { allowCreate: true });
    console.log(`Ingest 1: action=${ingestRes1.action}, variantId=${ingestRes1.variantId}`);

    // Ingest again (deduplication check)
    const ingestRes2 = await ingestionService.ingest(extracted, store.id, false, { allowCreate: false });
    console.log(`Ingest 2 (Deduplication test): action=${ingestRes2.action}, variantId=${ingestRes2.variantId}`);

    // Verify DB persistence
    const { data: priceRow } = await supabase
      .from('prices')
      .select('*, product_variants(id, product_id, products(id, name, slug))')
      .eq('variant_id', ingestRes1.variantId)
      .eq('store_id', store.id)
      .single();

    console.log(`DB Price Record ID: ${priceRow?.id}`);
    console.log(`Associated Canonical Product: ${priceRow?.product_variants?.products?.name} (slug: ${priceRow?.product_variants?.products?.slug})`);

    results.push({
      store: 'naheed',
      title: extracted.name,
      url: extracted.sourceUrl,
      price: extracted.price,
      inStock: extracted.inStock,
      validation: validation.action,
      ingest1Action: ingestRes1.action,
      ingest2Action: ingestRes2.action,
      persistedPriceId: priceRow?.id,
      canonicalSlug: priceRow?.product_variants?.products?.slug
    });
  }

  return results;
}

async function main() {
  const alFatahResults = await testAlFatah();
  const naheedResults = await testNaheed();

  console.log('\n\n=== AL-FATAH & NAHEED SUMMARY RESULTS ===');
  console.log(JSON.stringify({ alFatahResults, naheedResults }, null, 2));
}

main().catch(console.error);
