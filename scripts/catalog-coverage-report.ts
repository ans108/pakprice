import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { ScraperRegistry } from '../apps/scraper/src/scrapers/ScraperRegistry';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export interface CatalogCoverageReportData {
  catalog: {
    totalProducts: number;
    totalVariants: number;
    activeProducts: number;
    activeVariants: number;
    productsWithImages: number;
    variantsWithImages: number;
    productsWithCurrentPrice: number;
    variantsWithCurrentPrice: number;
    productsWithMultiStorePrices: number;
    averageStoresPerProduct: number;
    productsWithNoCurrentPrice: number;
    variantsIncompleteSpecs: number;
    categories: Array<{ name: string; slug: string; productCount: number; variantCount: number; storeCount: number }>;
    brands: Array<{ name: string; slug: string; productCount: number }>;
  };
  stores: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    scraperRegistered: boolean;
    lastSuccessfulScrape: string | null;
    lastFailedScrape: string | null;
    productsDiscovered: number;
    currentPrices: number;
    variantsCovered: number;
    imageCoverage: number;
  }>;
}

export async function generateCatalogCoverageReport(): Promise<CatalogCoverageReportData> {
  console.log('Fetching database records for catalog coverage report...');

  // 1. Stores
  const { data: storesData, error: storesErr } = await db
    .from('stores')
    .select('id, name, slug, is_active')
    .order('name');
  if (storesErr) throw storesErr;

  // 2. Products
  const { data: productsData, error: prodErr } = await db
    .from('products')
    .select('id, name, slug, category_id, brand_id, is_active, image_url');
  if (prodErr) throw prodErr;

  // 3. Product Variants
  const { data: variantsData, error: varErr } = await db
    .from('product_variants')
    .select('id, product_id, sku, ram_gb, storage_gb, color, is_active, image_url');
  if (varErr) throw varErr;

  // 4. Current Prices
  const { data: pricesData, error: priceErr } = await db
    .from('prices')
    .select('id, variant_id, store_id, price, in_stock, product_url, last_scraped_at');
  if (priceErr) throw priceErr;

  // 5. Categories
  const { data: categoriesData, error: catErr } = await db
    .from('categories')
    .select('id, name, slug');
  if (catErr) throw catErr;

  // 6. Brands
  const { data: brandsData, error: brandErr } = await db
    .from('brands')
    .select('id, name, slug');
  if (brandErr) throw brandErr;

  // 7. Scrape Jobs
  const { data: scrapeJobsData } = await db
    .from('scrape_jobs')
    .select('id, store_id, status, started_at, completed_at, error, metadata')
    .order('started_at', { ascending: false });

  // 8. Store Product Identifiers
  const { data: storeIdentifiersData } = await db
    .from('store_product_identifiers')
    .select('id, store_id, variant_id, identifier_type, identifier');

  const products = productsData || [];
  const variants = variantsData || [];
  const prices = pricesData || [];
  const categories = categoriesData || [];
  const brands = brandsData || [];
  const stores = storesData || [];
  const scrapeJobs = scrapeJobsData || [];
  const storeIdentifiers = storeIdentifiersData || [];

  // Variant to Product mapping
  const variantToProductMap = new Map<string, string>();
  for (const v of variants) {
    variantToProductMap.set(v.id, v.product_id);
  }

  // Variant prices mapping
  const variantPricesMap = new Map<string, Array<any>>();
  const productStoresMap = new Map<string, Set<string>>();
  for (const p of prices) {
    if (!variantPricesMap.has(p.variant_id)) {
      variantPricesMap.set(p.variant_id, []);
    }
    variantPricesMap.get(p.variant_id)!.push(p);

    const productId = variantToProductMap.get(p.variant_id);
    if (productId) {
      if (!productStoresMap.has(productId)) {
        productStoresMap.set(productId, new Set());
      }
      productStoresMap.get(productId)!.add(p.store_id);
    }
  }

  // Catalog computations
  const totalProducts = products.length;
  const totalVariants = variants.length;
  const activeProducts = products.filter((p) => p.is_active).length;
  const activeVariants = variants.filter((v) => v.is_active).length;
  const productsWithImages = products.filter((p) => Boolean(p.image_url && p.image_url.trim())).length;
  const variantsWithImages = variants.filter((v) => Boolean(v.image_url && v.image_url.trim())).length;

  let productsWithCurrentPrice = 0;
  let productsWithMultiStorePrices = 0;
  let totalStoresAcrossProducts = 0;
  let productsWithNoCurrentPrice = 0;

  for (const p of products) {
    const storeSet = productStoresMap.get(p.id);
    if (storeSet && storeSet.size > 0) {
      productsWithCurrentPrice++;
      totalStoresAcrossProducts += storeSet.size;
      if (storeSet.size >= 2) {
        productsWithMultiStorePrices++;
      }
    } else {
      productsWithNoCurrentPrice++;
    }
  }

  const averageStoresPerProduct =
    productsWithCurrentPrice > 0 ? Number((totalStoresAcrossProducts / productsWithCurrentPrice).toFixed(2)) : 0;

  let variantsWithCurrentPrice = 0;
  let variantsIncompleteSpecs = 0;
  for (const v of variants) {
    if (variantPricesMap.has(v.id) && variantPricesMap.get(v.id)!.length > 0) {
      variantsWithCurrentPrice++;
    }
    // Incomplete specs if neither RAM nor storage nor color is known
    if (v.ram_gb === null && v.storage_gb === null && !v.color) {
      variantsIncompleteSpecs++;
    }
  }

  // Categories aggregation
  const categoryStats = categories.map((cat) => {
    const catProducts = products.filter((p) => p.category_id === cat.id);
    const catProdIds = new Set(catProducts.map((p) => p.id));
    const catVariants = variants.filter((v) => catProdIds.has(v.product_id));
    const catStoreIds = new Set<string>();

    for (const prodId of catProdIds) {
      const storesForProd = productStoresMap.get(prodId);
      if (storesForProd) {
        storesForProd.forEach((s) => catStoreIds.add(s));
      }
    }

    return {
      name: cat.name,
      slug: cat.slug,
      productCount: catProducts.length,
      variantCount: catVariants.length,
      storeCount: catStoreIds.size,
    };
  });

  // Brands aggregation
  const brandStats = brands
    .map((b) => {
      const bProducts = products.filter((p) => p.brand_id === b.id);
      return {
        name: b.name,
        slug: b.slug,
        productCount: bProducts.length,
      };
    })
    .filter((b) => b.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount);

  // Store registry check
  const registry = ScraperRegistry.getInstance();

  // Stores detail
  const storeReports = stores.map((s) => {
    const storePrices = prices.filter((p) => p.store_id === s.id);
    const storeIdentifiersForStore = storeIdentifiers.filter((si) => si.store_id === s.id);
    const uniqueVariantIds = new Set(storePrices.map((p) => p.variant_id));
    const uniqueProductIds = new Set<string>();
    for (const vId of uniqueVariantIds) {
      const pId = variantToProductMap.get(vId);
      if (pId) uniqueProductIds.add(pId);
    }
    for (const si of storeIdentifiersForStore) {
      const pId = variantToProductMap.get(si.variant_id);
      if (pId) uniqueProductIds.add(pId);
    }

    // Scrape jobs for this store
    const storeJobs = scrapeJobs.filter((j) => j.store_id === s.id);
    const successJobs = storeJobs.filter((j) => j.status === 'completed');
    const failedJobs = storeJobs.filter((j) => j.status === 'failed');

    const lastSuccessfulScrape = successJobs.length > 0 ? successJobs[0].completed_at || successJobs[0].started_at : null;
    const lastFailedScrape = failedJobs.length > 0 ? failedJobs[0].completed_at || failedJobs[0].started_at : null;

    // Image coverage for products of this store
    let storeImages = 0;
    for (const pId of uniqueProductIds) {
      const prod = products.find((p) => p.id === pId);
      if (prod && prod.image_url) storeImages++;
    }

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      isActive: s.is_active,
      scraperRegistered: registry.has(s.slug),
      lastSuccessfulScrape,
      lastFailedScrape,
      productsDiscovered: uniqueProductIds.size,
      currentPrices: storePrices.length,
      variantsCovered: uniqueVariantIds.size,
      imageCoverage: storeImages,
    };
  });

  return {
    catalog: {
      totalProducts,
      totalVariants,
      activeProducts,
      activeVariants,
      productsWithImages,
      variantsWithImages,
      productsWithCurrentPrice,
      variantsWithCurrentPrice,
      productsWithMultiStorePrices,
      averageStoresPerProduct,
      productsWithNoCurrentPrice,
      variantsIncompleteSpecs,
      categories: categoryStats,
      brands: brandStats,
    },
    stores: storeReports,
  };
}

async function runSearchAudit() {
  console.log('\n--- Auditing Product Search Behavior ---');
  // Test representative queries
  const testQueries = ['iphone', 'samsung', 'infinix', 'redmi', 'laptop'];
  for (const q of testQueries) {
    const { data: results, count } = await db
      .from('products')
      .select('id, name, slug, brand:brands(name), category:categories(name)', { count: 'exact' })
      .ilike('name', `%${q}%`)
      .limit(5);

    console.log(`Query "${q}": found ${count} products (sample: ${results?.map((r) => r.name).slice(0, 2).join(' | ')})`);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PAKPRICE CATALOG COVERAGE & STORE AUDIT REPORT (PHASE 0)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const data = await generateCatalogCoverageReport();

    console.log('=============================================================');
    console.log('  GLOBAL CATALOG SUMMARY');
    console.log('=============================================================');
    console.log(`Total Products:                   ${data.catalog.totalProducts}`);
    console.log(`Total Product Variants:           ${data.catalog.totalVariants}`);
    console.log(`Active Products:                  ${data.catalog.activeProducts}`);
    console.log(`Active Product Variants:          ${data.catalog.activeVariants}`);
    console.log(`Products with Images:             ${data.catalog.productsWithImages} (${((data.catalog.productsWithImages / (data.catalog.totalProducts || 1)) * 100).toFixed(1)}%)`);
    console.log(`Variants with Images:             ${data.catalog.variantsWithImages} (${((data.catalog.variantsWithImages / (data.catalog.totalVariants || 1)) * 100).toFixed(1)}%)`);
    console.log(`Products with >=1 Current Price:  ${data.catalog.productsWithCurrentPrice} (${((data.catalog.productsWithCurrentPrice / (data.catalog.totalProducts || 1)) * 100).toFixed(1)}%)`);
    console.log(`Variants with >=1 Current Price:  ${data.catalog.variantsWithCurrentPrice} (${((data.catalog.variantsWithCurrentPrice / (data.catalog.totalVariants || 1)) * 100).toFixed(1)}%)`);
    console.log(`Products with 2+ Store Prices:    ${data.catalog.productsWithMultiStorePrices} (${((data.catalog.productsWithMultiStorePrices / (data.catalog.totalProducts || 1)) * 100).toFixed(1)}%)`);
    console.log(`Average Stores per Priced Product:${data.catalog.averageStoresPerProduct}`);
    console.log(`Products with No Current Price:   ${data.catalog.productsWithNoCurrentPrice}`);
    console.log(`Variants Incomplete Specs:        ${data.catalog.variantsIncompleteSpecs}`);

    console.log('\n=============================================================');
    console.log('  CATEGORY BREAKDOWN');
    console.log('=============================================================');
    console.table(data.catalog.categories);

    console.log('\n=============================================================');
    console.log('  TOP BRANDS BREAKDOWN');
    console.log('=============================================================');
    console.table(data.catalog.brands.slice(0, 15));

    console.log('\n=============================================================');
    console.log('  STORE REGISTRY & COVERAGE DETAIL');
    console.log('=============================================================');
    console.table(
      data.stores.map((s) => ({
        Name: s.name,
        Slug: s.slug,
        Active: s.isActive,
        'Scraper Impl': s.scraperRegistered ? 'YES' : 'NO',
        Products: s.productsDiscovered,
        Prices: s.currentPrices,
        Variants: s.variantsCovered,
        'Last Success': s.lastSuccessfulScrape ? s.lastSuccessfulScrape.substring(0, 19) : 'Never',
        'Last Failure': s.lastFailedScrape ? s.lastFailedScrape.substring(0, 19) : 'Never',
      }))
    );

    await runSearchAudit();

    console.log('\nReport generation completed successfully.');
  } catch (err) {
    console.error('Failed to generate catalog coverage report:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
