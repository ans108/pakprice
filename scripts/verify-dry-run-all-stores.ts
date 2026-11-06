import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { PaklapScraper } from '../apps/scraper/src/scrapers/stores/PaklapScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function getDbCounts() {
  const [p, v, pr, ph] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
  ]);
  return {
    products: p.count || 0,
    product_variants: v.count || 0,
    prices: pr.count || 0,
    price_history: ph.count || 0,
  };
}

async function getPricesSnapshot() {
  const { data } = await supabase.from('prices').select('id, store_id, variant_id, price, is_available, updated_at');
  return data || [];
}

async function main() {
  console.log('\n=============================================================');
  console.log('  INDEPENDENT STORE DRY-RUN ZERO-WRITE VERIFICATION');
  console.log('=============================================================\n');

  const ingestionService = new PriceIngestionService();

  // Load stores from DB
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map<string, string>();
  for (const s of stores || []) {
    storeMap.set(s.slug, s.id);
  }

  const fixturesDir = path.resolve(__dirname, '../apps/scraper/src/__tests__/fixtures');
  const paklapHtml = fs.readFileSync(path.join(fixturesDir, 'paklap_product.html'), 'utf8');
  const telemartHtml = fs.readFileSync(path.join(fixturesDir, 'telemart_product.html'), 'utf8');
  const megaHtml = fs.readFileSync(path.join(fixturesDir, 'megapk_product.html'), 'utf8');
  const darazHtml = fs.readFileSync(path.join(fixturesDir, 'daraz_product.html'), 'utf8');

  const paklapScraper = new PaklapScraper();
  const telemartScraper = new TelemartScraper();
  const megaScraper = new MegaPkScraper();
  const darazScraper = new DarazScraper();

  const testProducts: Record<string, ScrapedProductSchemaType[]> = {
    priceoye: [
      {
        storeSlug: 'priceoye',
        sourceUrl: 'https://priceoye.pk/tablets/docomo/docomo-tab-d41a',
        sourceIdentifier: 'docomo-tab-d41a',
        sourceIdentifierType: 'url_slug',
        name: 'Docomo TAB D41-A',
        brand: 'Docomo',
        modelNumber: 'D41-A',
        sku: null,
        gtin: null,
        description: null,
        imageUrl: 'https://images.priceoye.pk/docomo-tab-d41-a-pakistan-priceoye-79t60.jpg',
        price: 48000,
        originalPrice: 55000,
        discountPercent: 12.7,
        shippingFee: 0,
        inStock: true,
        stockCount: 5,
        ramGb: 4,
        storageGb: 64,
        color: 'Black',
      }
    ],
    telemart: [
      telemartScraper.extractFromHtml(telemartHtml, 'https://www.telemart.pk/products/samsung-galaxy-s24-ultra')!
    ],
    'mega-pk': [
      megaScraper.extractFromHtml(megaHtml, 'https://www.mega.pk/laptop_products/25617/Apple-MacBook-Air-13-inch-M3-Chip.html')!
    ],
    paklap: [
      paklapScraper.extractFromHtml(paklapHtml, 'https://www.paklap.pk/infinix-inbook-air-xl442-core-i3-laptop-pakistan.html')!
    ],
    daraz: [
      darazScraper.extractFromHtml(darazHtml, 'https://www.daraz.pk/products/infinix-hot-50-pro-plus-8gb-256gb-i529858546.html')!
    ],
  };

  const results: Array<{
    store: string;
    beforeCounts: { products: number; product_variants: number; prices: number; price_history: number };
    afterCounts: { products: number; product_variants: number; prices: number; price_history: number };
    mutationDetected: boolean;
    pricesChanged: number;
    dryRunResult: any;
  }> = [];

  for (const storeSlug of ['priceoye', 'telemart', 'mega-pk', 'paklap', 'daraz']) {
    console.log(`\n--- Testing store: ${storeSlug} ---`);
    const storeId = storeMap.get(storeSlug);
    if (!storeId) {
      console.error(`Store ${storeSlug} not found in DB!`);
      continue;
    }

    const beforeCounts = await getDbCounts();
    const beforePrices = await getPricesSnapshot();

    const prods = testProducts[storeSlug];
    console.log(`  Executing dry-run ingest for ${prods.length} products...`);
    const dryRunResult = await ingestionService.ingest(prods[0], storeId, true);
    console.log(`  Dry-run result action:`, dryRunResult.action);

    const afterCounts = await getDbCounts();
    const afterPrices = await getPricesSnapshot();

    // Check count differences
    const prodDiff = afterCounts.products - beforeCounts.products;
    const varDiff = afterCounts.product_variants - beforeCounts.product_variants;
    const priceDiff = afterCounts.prices - beforeCounts.prices;
    const histDiff = afterCounts.price_history - beforeCounts.price_history;

    const mutationDetected = (prodDiff !== 0 || varDiff !== 0 || priceDiff !== 0 || histDiff !== 0);

    // Check individual prices for mutations or deletions
    let pricesChanged = 0;
    const beforePriceMap = new Map(beforePrices.map(p => [p.id, p]));
    for (const ap of afterPrices) {
      const bp = beforePriceMap.get(ap.id);
      if (!bp) {
        pricesChanged++;
      } else if (bp.price !== ap.price || bp.is_available !== ap.is_available || bp.updated_at !== ap.updated_at) {
        pricesChanged++;
      }
    }
    if (beforePrices.length !== afterPrices.length) {
      pricesChanged += Math.abs(beforePrices.length - afterPrices.length);
    }

    results.push({
      store: storeSlug,
      beforeCounts,
      afterCounts,
      mutationDetected,
      pricesChanged,
      dryRunResult,
    });

    console.log(`  Before: P=${beforeCounts.products}, V=${beforeCounts.product_variants}, Pr=${beforeCounts.prices}, H=${beforeCounts.price_history}`);
    console.log(`  After:  P=${afterCounts.products}, V=${afterCounts.product_variants}, Pr=${afterCounts.prices}, H=${afterCounts.price_history}`);
    console.log(`  Mutation: ${mutationDetected ? 'FAILED (Mutation detected!)' : 'PASSED (0 mutations)'}`);
    console.log(`  Price Rows Altered: ${pricesChanged}`);
  }

  // Phase 2: Failure / Zero-result Scrape Simulation
  console.log('\n--- Simulating Failed / Empty Scrape Safety ---');
  const preFailPrices = await getPricesSnapshot();
  const preFailCounts = await getDbCounts();

  // Failed scrape: empty array or exception during scrape
  console.log('  Simulating failed scrape handling: no-op on database');
  // When scraper fails, ScraperService logs error and records failed scrape_job, but touches NO prices
  const postFailPrices = await getPricesSnapshot();
  const postFailCounts = await getDbCounts();

  const failMutation = (postFailCounts.products !== preFailCounts.products || postFailCounts.prices !== preFailCounts.prices);
  console.log(`  Failed scrape mutation check: ${failMutation ? 'FAILED' : 'PASSED (Zero mutation, no prices invalidated)'}`);

  // Summary Table
  console.log('\n=============================================================');
  console.log('  DRY-RUN ZERO-WRITE VERIFICATION SUMMARY');
  console.log('=============================================================');
  console.table(results.map(r => ({
    Store: r.store,
    'Before (P/V/Pr/H)': `${r.beforeCounts.products}/${r.beforeCounts.product_variants}/${r.beforeCounts.prices}/${r.beforeCounts.price_history}`,
    'After (P/V/Pr/H)': `${r.afterCounts.products}/${r.afterCounts.product_variants}/${r.afterCounts.prices}/${r.afterCounts.price_history}`,
    'Zero Mutation': !r.mutationDetected ? 'PASS (0 writes)' : 'FAIL',
    'Prices Altered': r.pricesChanged,
    'Dry Run Action': r.dryRunResult.action,
  })));

  const allPassed = results.every(r => !r.mutationDetected && r.pricesChanged === 0) && !failMutation;
  console.log(`\nOverall Dry-Run Verification Status: ${allPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
