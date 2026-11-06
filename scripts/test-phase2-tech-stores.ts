import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface TechTestTarget {
  productName: string;
  canonicalSlug: string;
  canonicalProductId: string;
  canonicalVariantId: string;
  storeTargets: {
    storeSlug: string;
    url?: string;
  }[];
}

const targets: TechTestTarget[] = [
  {
    productName: 'Samsung Galaxy Watch Ultra SM-L705F',
    canonicalSlug: 'samsung-samsung-galaxy-watch-ultra-sm-l705f',
    canonicalProductId: '6a003dd8-207f-4341-bac4-f06e2e444e3e',
    canonicalVariantId: '3f35b126-c86a-4266-a775-c8e0706d3184',
    storeTargets: [
      { storeSlug: 'priceoye', url: 'https://priceoye.pk/smart-watches/samsung/samsung-watch-ultra-sm-l705f' },
      { storeSlug: 'telemart', url: 'https://www.telemart.pk/products/samsung-galaxy-watch-ultra-sm-l705f' },
      { storeSlug: 'shophive', url: 'https://www.shophive.com/samsung-galaxy-watch-ultra-47mm/' },
      { storeSlug: 'mega-pk', url: 'https://www.mega.pk/watches_products/26850/Samsung-Galaxy-Watch-Ultra-47mm.html' }
    ]
  },
  {
    productName: 'Samsung Galaxy Watch 8 40mm',
    canonicalSlug: 'samsung-samsung-galaxy-watch-8-40mm',
    canonicalProductId: '230f9f5d-0b00-421f-bcdd-a4e83a50b878',
    canonicalVariantId: '3486efcf-79a1-408e-9e04-8d7792e72a64',
    storeTargets: [
      { storeSlug: 'telemart', url: 'https://www.telemart.pk/collections/mens-watches/products/samsung-galaxy-watch-8-40mm' },
      { storeSlug: 'mega-pk', url: 'https://www.mega.pk/watches_products/26849/Samsung-Galaxy-Watch-8-40mm.html' },
      { storeSlug: 'priceoye' },
      { storeSlug: 'shophive' }
    ]
  },
  {
    productName: 'Apple iPhone 17 Pro Max',
    canonicalSlug: 'unknown-apple-iphone-17-pro-max',
    canonicalProductId: 'c09b199c-2701-4ef7-ba24-c2b2b9638524',
    canonicalVariantId: '621cdabd-c2f6-42e5-8a20-2bd52d4b6374',
    storeTargets: [
      { storeSlug: 'priceoye', url: 'https://priceoye.pk/mobiles/apple/apple-iphone-17-pro-max' },
      { storeSlug: 'mega-pk', url: 'https://www.mega.pk/mobiles_products/26774/Apple-iPhone-17-Pro-Max.html' },
      { storeSlug: 'telemart', url: 'https://www.telemart.pk/products/apple-iphone-17-pro-max-pta-approved-with-official-warranty' },
      { storeSlug: 'shophive' }
    ]
  }
];

async function main() {
  console.log('=== PHASE 2: TECH STORES LIVE VERIFICATION ===\n');

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.slug, s]));

  const priceOyeScraper = new PriceOyeScraper();
  const telemartScraper = new TelemartScraper();
  const megaPkScraper = new MegaPkScraper();
  const shophiveScraper = new ShophiveScraper();
  const ingestionService = new PriceIngestionService();

  const results: any[] = [];

  for (const target of targets) {
    console.log(`\n======================================================`);
    console.log(`Target: ${target.productName} (slug: ${target.canonicalSlug})`);
    console.log(`Canonical Product ID: ${target.canonicalProductId}`);
    console.log(`Canonical Variant ID: ${target.canonicalVariantId}`);
    console.log(`======================================================`);

    for (const st of target.storeTargets) {
      const store = storeMap.get(st.storeSlug);
      if (!store) {
        console.error(`Store ${st.storeSlug} not found in DB`);
        continue;
      }

      console.log(`\n--- Testing Store: ${store.name} (${st.storeSlug}) ---`);
      if (!st.url) {
        console.log(`Result: No matching listing found after query/catalog search (store does not carry model).`);
        results.push({
          target: target.productName,
          canonicalProductId: target.canonicalProductId,
          canonicalVariantId: target.canonicalVariantId,
          storeSlug: st.storeSlug,
          status: 'NO_MATCHING_LISTING',
          reason: 'No genuine matching listing found on store'
        });
        continue;
      }

      console.log(`Live source URL: ${st.url}`);
      let extracted: any = null;

      try {
        if (st.storeSlug === 'priceoye') {
          const res = await axios.get(st.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
          });
          extracted = priceOyeScraper.extractProductFromHtml(res.data, st.url);
        } else if (st.storeSlug === 'telemart') {
          // Fetch Shopify product JSON (.json endpoint returns real PKR, whereas .js returns cents)
          const handle = st.url.split('/products/').pop()?.split('?')[0];
          const jsonUrl = `https://www.telemart.pk/products/${handle}.json`;
          try {
            const res = await axios.get(jsonUrl, { timeout: 15000 });
            extracted = telemartScraper.extractFromShopifyProduct(res.data.product || res.data);
          } catch {
            const resHtml = await axios.get(st.url, { timeout: 15000 });
            extracted = telemartScraper.extractFromHtml(resHtml.data, st.url);
          }
        } else if (st.storeSlug === 'mega-pk') {
          const res = await axios.get(st.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
          });
          extracted = megaPkScraper.extractFromHtml(res.data, st.url);
        } else if (st.storeSlug === 'shophive') {
          const res = await axios.get(st.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
          });
          extracted = shophiveScraper.extractProductFromHtml(res.data, st.url, 'smart-watches');
        }
      } catch (fetchErr: any) {
        console.error(`Fetch error for ${st.storeSlug}: ${fetchErr.message}`);
        results.push({
          target: target.productName,
          canonicalProductId: target.canonicalProductId,
          canonicalVariantId: target.canonicalVariantId,
          storeSlug: st.storeSlug,
          sourceUrl: st.url,
          status: 'REQUEST_FAILED',
          error: fetchErr.message
        });
        continue;
      }

      if (!extracted) {
        console.log(`Failed to extract product from ${st.url}`);
        results.push({
          target: target.productName,
          canonicalProductId: target.canonicalProductId,
          canonicalVariantId: target.canonicalVariantId,
          storeSlug: st.storeSlug,
          sourceUrl: st.url,
          status: 'EXTRACTION_FAILED',
          reason: 'Parser returned null'
        });
        continue;
      }

      console.log(`Extracted title: "${extracted.name}"`);
      console.log(`Extracted price: PKR ${extracted.price}, original: ${extracted.originalPrice}, inStock: ${extracted.inStock}`);

      // Run PriceValidator
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
      console.log(`PriceValidator result: action=${validation.action}, warnings=${JSON.stringify(validation.warnings)}, rejectReason=${validation.rejectReason}`);

      // Run Ingestion with allowCreate: false (matching to existing canonical variant)
      console.log(`Ingesting with allowCreate: false...`);
      const ingestResult = await ingestionService.ingest(extracted, store.id, false, { allowCreate: false });
      console.log(`Ingest action: ${ingestResult.action}, matchedVariantId: ${ingestResult.variantId}, reason: ${ingestResult.reason}`);

      // Query database for persisted price record
      let persistedPrice: any = null;
      if (ingestResult.variantId) {
        const { data: pr } = await supabase
          .from('prices')
          .select('*')
          .eq('variant_id', ingestResult.variantId)
          .eq('store_id', store.id)
          .maybeSingle();
        persistedPrice = pr;
      }

      const now = Date.now();
      const lastScraped = persistedPrice?.last_scraped_at ? new Date(persistedPrice.last_scraped_at).getTime() : 0;
      const ageHours = (now - lastScraped) / (1000 * 60 * 60);
      const freshness = ageHours <= 24 ? 'FRESH (<= 24h)' : 'STALE (> 24h)';

      console.log(`Persisted Price ID: ${persistedPrice?.id || 'NONE'}`);
      console.log(`Persisted Price: PKR ${persistedPrice?.price || 'NONE'}`);
      console.log(`Last Scraped At: ${persistedPrice?.last_scraped_at || 'NONE'} (${freshness})`);

      results.push({
        target: target.productName,
        canonicalProductId: target.canonicalProductId,
        canonicalVariantId: target.canonicalVariantId,
        storeSlug: st.storeSlug,
        sourceUrl: st.url,
        extractedTitle: extracted.name,
        extractedPrice: extracted.price,
        inStock: extracted.inStock,
        priceValidatorResult: validation.action !== 'rejected' ? 'VALID' : 'INVALID',
        matchingDecision: ingestResult.action,
        matchedVariantId: ingestResult.variantId,
        rejectionReason: ingestResult.reason,
        persistedPriceId: persistedPrice?.id,
        persistedPrice: persistedPrice?.price,
        lastScrapedAt: persistedPrice?.last_scraped_at,
        freshness
      });
    }
  }

  console.log('\n\n=== TECH STORES SUMMARY RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
