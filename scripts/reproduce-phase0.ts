import { chromium } from 'playwright';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
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

interface TestCase {
  store: string;
  url: string;
  canonicalSlug: string;
}

const TEST_CASES: TestCase[] = [
  {
    store: 'priceoye',
    url: 'https://priceoye.pk/mobiles/samsung/samsung-galaxy-a07',
    canonicalSlug: 'samsung-samsung-galaxy-a07-dual-sim-with-official-warranty',
  },
  {
    store: 'priceoye',
    url: 'https://priceoye.pk/mobiles/xiaomi/xiaomi-redmi-note-13-pro',
    canonicalSlug: 'xiaomi-xiaomi-redmi-note-13-pro-dual-sim-with-official-warranty',
  },
  {
    store: 'priceoye',
    url: 'https://priceoye.pk/mobiles/infinix/infinix-hot-60i',
    canonicalSlug: 'infinix-infinix-hot-60i-dual-sim-with-official-warranty',
  },
];

async function runReproduction() {
  console.log('=== PHASE 0 — REPRODUCING PIPELINE FAILURES ===\n');
  const scraper = new PriceOyeScraper();
  const browser = await chromium.launch({ headless: true });
  const context = await (scraper as any).createContext(browser);
  const page = await context.newPage();
  const matcher = new ProductMatcher();

  const { data: storeRow } = await supabase.from('stores').select('id').eq('slug', 'priceoye').single();
  const storeId = storeRow!.id;

  for (const tc of TEST_CASES) {
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST PRODUCT: ${tc.url}`);
    console.log(`Expected Canonical Slug: ${tc.canonicalSlug}`);

    // Check DB for canonical product
    const { data: canonicalProd } = await supabase
      .from('products')
      .select('id, name, slug, brand_id, normalized_name, product_variants(*)')
      .eq('slug', tc.canonicalSlug)
      .single();

    if (!canonicalProd) {
      console.log(`[DB Check] Canonical product NOT found in DB by slug: ${tc.canonicalSlug}`);
      continue;
    }
    console.log(`[DB Check] Canonical product in DB: "${canonicalProd.name}" (${canonicalProd.id})`);
    console.log(`[DB Check] Normalized name in DB: "${canonicalProd.normalized_name}"`);
    console.log(`[DB Check] Variants count: ${canonicalProd.product_variants.length}`);

    // Step 1: Scraper extraction
    console.log(`\n[Stage C/D] Scraping PDP...`);
    const scraped = await (scraper as any).scrapeProductPage(page, tc.url);
    if (!scraped) {
      console.log(`❌ Stage C: Scraper returned null / extraction failed`);
      continue;
    }
    console.log(`Extracted name: "${scraped.name}"`);
    console.log(`Extracted price: ${scraped.price}`);
    console.log(`Extracted originalPrice: ${scraped.originalPrice}`);
    console.log(`Extracted discountPercent: ${scraped.discountPercent}`);
    console.log(`Extracted brand: ${scraped.brand}`);
    console.log(`Extracted modelNumber: ${scraped.modelNumber}`);
    console.log(`Extracted inStock: ${scraped.inStock}`);

    // Validate schema
    const validated = scraper.validateProduct(scraped);
    if (!validated) {
      console.log(`❌ Stage D: validateProduct rejected the scraped data`);
      continue;
    }
    console.log(`✓ Scraped data is valid schema`);

    // Step 2: Matching
    console.log(`\n[Stage E/F] Testing ProductMatcher...`);
    const match = await matcher.match(validated, storeId);
    console.log(`Match status: ${match.status}`);
    console.log(`Match method: ${match.method}`);
    console.log(`Match confidence: ${match.confidence}`);
    console.log(`Match reason: ${match.reason}`);
    if (match.product) {
      console.log(`Matched to product: "${match.product.name}" (${match.product.id})`);
      if (match.product.id === canonicalProd.id) {
        console.log(`✓ MATCHED CORRECT CANONICAL PRODUCT!`);
      } else {
        console.log(`❌ MATCHED WRONG PRODUCT: ${match.product.slug} vs expected ${tc.canonicalSlug}`);
      }
    } else {
      console.log(`❌ Matcher failed to match! Status is ${match.status}`);
    }
  }

  await browser.close();
}

runReproduction().catch(console.error);
