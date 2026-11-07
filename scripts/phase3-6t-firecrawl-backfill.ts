/**
 * Increment 6T — Firecrawl & Cross-Store Discovery Backfill
 *
 * Persists verified Increment 6S candidates and expands high-overlap single-store
 * products until multi-store coverage reaches >= 41 / 822 (>= 5.0%).
 * Adheres strictly to locked rules: allowCreate=false, 0 duplicate (variant_id, store_id),
 * PriceValidator enforcement, and 0 new products/variants created.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { PriceRepository } from '../apps/scraper/src/repositories/PriceRepository';
import { ProductRepository } from '../apps/scraper/src/repositories/ProductRepository';
import { validatePrice } from '../apps/scraper/src/validators/priceValidator';
import { FirecrawlValidator, FirecrawlCandidateJson } from './firecrawl-validator';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/TelemartScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/ShophiveScraper';
import { MegaScraper } from '../apps/scraper/src/scrapers/MegaScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface PersistOfferParams {
  variantId: string;
  storeId: string;
  price: number;
  originalPrice: number | null;
  productUrl: string;
  inStock: boolean;
  sku: string | null;
}

const priceRepo = new PriceRepository();
const productRepo = new ProductRepository();
const priceoyeScraper = new PriceOyeScraper();
const telemartScraper = new TelemartScraper();
const shophiveScraper = new ShophiveScraper();
const megaScraper = new MegaScraper();

async function persistOffer(params: PersistOfferParams): Promise<{ success: boolean; reason?: string }> {
  const { variantId, storeId, price, originalPrice, productUrl, inStock, sku } = params;

  // 1. Fetch current price row
  const currentPriceRow = await priceRepo.getCurrentPrice(variantId, storeId);
  const previousPrice = currentPriceRow ? currentPriceRow.price : null;
  const previousOriginalPrice = currentPriceRow ? currentPriceRow.original_price : null;

  // 2. Validate price
  const validation = validatePrice({
    price,
    originalPrice,
    discountPercent: null,
    shippingFee: null,
    inStock,
    stockCount: null,
    previousPrice,
    previousOriginalPrice,
  });

  if (!validation.isValid) {
    return { success: false, reason: `Price validation failed: ${validation.errors.join(', ')}` };
  }

  // 3. Upsert current price
  await priceRepo.upsertCurrentPrice({
    variant_id: variantId,
    store_id: storeId,
    price,
    original_price: originalPrice,
    currency: 'PKR',
    in_stock: inStock,
    product_url: productUrl,
  });

  // 4. Record in price_history
  if (!currentPriceRow || currentPriceRow.price !== price) {
    await priceRepo.insertPriceHistory(variantId, storeId, price, originalPrice, 0, inStock);
  }

  // 5. Upsert store_product_identifiers
  const now = new Date().toISOString();
  const identifier = sku || productUrl;
  const identifierType = sku ? 'sku' : 'url_slug';

  await supabase
    .from('store_product_identifiers')
    .upsert(
      {
        variant_id: variantId,
        store_id: storeId,
        identifier_type: identifierType,
        identifier,
        last_seen_at: now,
      },
      { onConflict: 'store_id,identifier_type,identifier' }
    );

  return { success: true };
}

async function getMultiStoreCount(): Promise<{ totalProducts: number; multiStoreCount: number }> {
  const { data: prices } = await supabase
    .from('prices')
    .select('store_id, product_variants!inner(product_id)');

  const prodStores = new Map<string, Set<string>>();
  for (const p of (prices as any[]) || []) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    if (!prodStores.has(prodId)) prodStores.set(prodId, new Set());
    prodStores.get(prodId)!.add(p.store_id);
  }

  let multi = 0;
  for (const set of prodStores.values()) {
    if (set.size > 1) multi++;
  }
  return { totalProducts: prodStores.size, multiStoreCount: multi };
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6T: MULTI-STORE EXPANSION TO >= 5.0%');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify baseline integrity
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Initial DB State: ${prodCount0} products, ${varCount0} variants`);

  const initialCoverage = await getMultiStoreCount();
  console.log(`Initial Multi-Store Products: ${initialCoverage.multiStoreCount} / ${prodCount0} (${((initialCoverage.multiStoreCount / (prodCount0 || 1)) * 100).toFixed(2)}%)\n`);

  // Initialize validator and load stores
  const validator = new FirecrawlValidator();
  await validator.init();

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.slug, s.id]));
  if (storeMap.get('mega-pk')) storeMap.set('mega', storeMap.get('mega-pk')!);

  const persistedOffers: any[] = [];

  // ── Step A: Persist 3 Verified 6S Candidates ──────────────────────────
  console.log('────────────────────────────────────────────────────────────────');
  console.log('  STEP A: Persisting 3 Approved Increment 6S Candidates');
  console.log('────────────────────────────────────────────────────────────────');

  const candidates6s = [
    {
      name: 'Infinix XE30 Wireless Earbuds',
      productId: 'e679b01b-1299-411f-aaf3-65aeee6d748e',
      variantId: 'e157e211-4c6e-48bf-b353-039a42514fe6',
      storeSlug: 'priceoye',
      price: 3149,
      originalPrice: 6999,
      url: 'https://priceoye.pk/wireless-earbuds/infinix/infinix-true-wireless-bluetooth-earbuds-xe30',
      stockStatus: true,
      sku: null,
    },
    {
      name: 'Lenovo LP80 Pro Gaming Earbuds',
      productId: '5b0ee0f0-449f-4460-af82-d0927fe3ea1e',
      variantId: 'f34592ca-447e-420a-ba6c-cbe42221d5ba',
      storeSlug: 'priceoye',
      price: 3249,
      originalPrice: 4000,
      url: 'https://priceoye.pk/wireless-earbuds/lenovo/lenovo-lp80-pro-wireless-earbuds',
      stockStatus: true,
      sku: null,
    },
    {
      name: 'Dany Titan T-100 Power Bank 20000 mAh',
      productId: '6f26d813-40ec-46a7-ae22-fc25c31d08f7',
      variantId: '0c21cd21-4606-47b3-9adc-b72cb9c52c78',
      storeSlug: 'telemart',
      price: 4899,
      originalPrice: 6200,
      url: 'https://www.telemart.pk/products/dany-titan-t-100-20000mah-pd-22-5w-fast-charging-power-bank',
      stockStatus: true,
      sku: null,
    },
  ];

  for (const c of candidates6s) {
    const storeId = storeMap.get(c.storeSlug);
    if (!storeId) {
      console.error(`  ❌ Store not found: ${c.storeSlug}`);
      continue;
    }

    const res = await persistOffer({
      variantId: c.variantId,
      storeId,
      price: c.price,
      originalPrice: c.originalPrice,
      productUrl: c.url,
      inStock: c.stockStatus,
      sku: c.sku,
    });

    if (res.success) {
      console.log(`  ✓ Persisted ${c.name} (${c.storeSlug} @ Rs. ${c.price.toLocaleString()})`);
      persistedOffers.push(c);
    } else {
      console.error(`  ❌ Failed to persist ${c.name}: ${res.reason}`);
    }
  }

  let currentCov = await getMultiStoreCount();
  console.log(`\nCoverage after Step A: ${currentCov.multiStoreCount} / ${prodCount0} (${((currentCov.multiStoreCount / (prodCount0 || 1)) * 100).toFixed(2)}%)`);

  // ── Step B: Targeted Discovery Across High-Overlap Categories ─────────
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STEP B: High-Overlap Targeted Cross-Store Discovery');
  console.log('────────────────────────────────────────────────────────────────');

  // Fetch single-store products in high overlap categories
  const { data: singleStoreProducts } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name ),
      categories ( name, slug ),
      product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( id, store_id, price, product_url )
      )
    `)
    .order('created_at', { ascending: false });

  // Filter candidates having exactly 1 store price
  const targets: any[] = [];
  for (const p of singleStoreProducts || []) {
    const storesSet = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        storesSet.add(pr.store_id);
      }
    }
    if (storesSet.size === 1) {
      const catSlug = (p.categories as any)?.slug || '';
      // Prioritize high-overlap categories: smart-watches, headphones-audio, mobiles
      targets.push({
        ...p,
        existingStoreId: Array.from(storesSet)[0],
        categorySlug: catSlug,
      });
    }
  }

  console.log(`Found ${targets.length} single-store products available for multi-store expansion.`);

  // Prioritize categories with highest cross-store presence
  const priorityTargets = targets.sort((a, b) => {
    const pRank = (slug: string) => {
      if (slug === 'smart-watches') return 1;
      if (slug === 'wireless-earbuds' || slug === 'headphones-audio') return 2;
      if (slug === 'mobiles') return 3;
      return 4;
    };
    return pRank(a.categorySlug) - pRank(b.categorySlug);
  });

  const TARGET_GOAL = 42; // Exceeds >= 41 (>= 5.0%)
  const discoveredNewOffers: any[] = [];

  for (const target of priorityTargets) {
    if (currentCov.multiStoreCount >= TARGET_GOAL) {
      console.log(`\n🎉 Reached target multi-store goal: ${currentCov.multiStoreCount} products!`);
      break;
    }

    const existingStoreSlug = Array.from(storeMap.entries()).find(([_, id]) => id === target.existingStoreId)?.[0];
    const candidateStores = ['priceoye', 'telemart', 'shophive'].filter(s => s !== existingStoreSlug);

    // Build concise query for search
    const cleanQuery = target.name
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\b(Dual Sim|With Official Warranty|Official Warranty|Pin Pack|PTA Approved)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`\nAuditing [${target.id.slice(0, 8)}] ${target.name} (${target.categorySlug})`);

    for (const storeSlug of candidateStores) {
      const storeId = storeMap.get(storeSlug);
      if (!storeId) continue;

      try {
        let candidateUrls: Array<{ title: string; url: string }> = [];

        if (storeSlug === 'shophive') {
          const searchUrl = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(cleanQuery)}`;
          const res = await axios.get(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a.product-item-link, .item.product a.product-item-link').each((_, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && href.startsWith('http') && title && !candidateUrls.some(c => c.url === href)) {
              candidateUrls.push({ title, url: href });
            }
          });
        } else if (storeSlug === 'priceoye') {
          const searchUrl = `https://priceoye.pk/search?q=${encodeURIComponent(cleanQuery)}`;
          const res = await axios.get(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
              const segs = fullUrl.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
              if (segs.length >= 3 && !fullUrl.includes('/pricelist/')) {
                const title = $(el).find('img').attr('alt') || $(el).text().trim() || segs[segs.length - 1];
                if (!candidateUrls.some(c => c.url === fullUrl)) {
                  candidateUrls.push({ title, url: fullUrl });
                }
              }
            }
          });
        } else if (storeSlug === 'telemart') {
          const searchUrl = `https://www.telemart.pk/search?q=${encodeURIComponent(cleanQuery)}`;
          const res = await axios.get(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a[href*="/products/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.telemart.pk${href.startsWith('/') ? '' : '/'}${href}`;
              const title = $(el).find('img').attr('alt') || $(el).text().trim();
              if (!candidateUrls.some(c => c.url === fullUrl)) {
                candidateUrls.push({ title, url: fullUrl });
              }
            }
          });
        }

        if (candidateUrls.length === 0) continue;

        // Evaluate candidates
        for (const cand of candidateUrls.slice(0, 3)) {
          // Fetch PDP
          let scrapedPdp: any = null;
          try {
            const pdpRes = await axios.get(cand.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
              timeout: 10000,
            });
            const html = pdpRes.data;
            if (storeSlug === 'shophive') {
              scrapedPdp = shophiveScraper.extractProductFromHtml(html, cand.url, target.categorySlug || 'smart-watches');
            } else if (storeSlug === 'priceoye') {
              scrapedPdp = priceoyeScraper.extractProductFromHtml(html, cand.url);
            } else if (storeSlug === 'telemart') {
              scrapedPdp = telemartScraper.extractFromHtml(html, cand.url);
            }
          } catch {
            continue;
          }

          if (!scrapedPdp || !scrapedPdp.price || scrapedPdp.price <= 0) continue;

          // Convert to candidate JSON for validator
          const candidateJson: FirecrawlCandidateJson = {
            store_name: storeSlug === 'priceoye' ? 'PriceOye' : storeSlug === 'telemart' ? 'Telemart' : 'Shophive',
            store_slug: storeSlug,
            source_product_title: scrapedPdp.name,
            source_product_url: cand.url,
            brand: scrapedPdp.brand || null,
            model: scrapedPdp.modelNumber || null,
            model_number: scrapedPdp.modelNumber || null,
            category: target.categorySlug,
            ram: scrapedPdp.ramGb ? `${scrapedPdp.ramGb}GB` : null,
            storage: scrapedPdp.storageGb ? `${scrapedPdp.storageGb}GB` : null,
            physical_size: null,
            color: scrapedPdp.color || null,
            price: scrapedPdp.price,
            original_price: scrapedPdp.originalPrice || null,
            currency: 'PKR',
            stock_status: scrapedPdp.inStock ? 'in_stock' : 'out_of_stock',
            sku: scrapedPdp.sku || null,
            image_url: scrapedPdp.imageUrl || null,
            description: null,
            discovery_method: 'direct_connector',
            extraction_timestamp: new Date().toISOString(),
          };

          const valResult = await validator.validateCandidate(target, candidateJson);

          if (valResult.status === 'approved' && valResult.matchedVariantId) {
            console.log(`  🎉 APPROVED: "${cand.title}" -> "${target.name}"`);
            console.log(`     Store: ${storeSlug} | Price: Rs. ${scrapedPdp.price.toLocaleString()} | Confidence: ${valResult.confidence} | Strategy: ${valResult.strategy}`);

            const persistRes = await persistOffer({
              variantId: valResult.matchedVariantId,
              storeId,
              price: scrapedPdp.price,
              originalPrice: scrapedPdp.originalPrice || null,
              productUrl: cand.url,
              inStock: scrapedPdp.inStock,
              sku: scrapedPdp.sku || null,
            });

            if (persistRes.success) {
              discoveredNewOffers.push({
                productName: target.name,
                productId: target.id,
                variantId: valResult.matchedVariantId,
                store: storeSlug,
                price: scrapedPdp.price,
                url: cand.url,
                strategy: valResult.strategy,
                confidence: valResult.confidence,
              });

              currentCov = await getMultiStoreCount();
              console.log(`     ✓ Persisted! Current Multi-Store Total: ${currentCov.multiStoreCount} / ${prodCount0}`);
              break; // One match per store is sufficient
            } else {
              console.log(`     ❌ Persistence error: ${persistRes.reason}`);
            }
          }
        }
      } catch (err: any) {
        // Continue politely
      }
    }
  }

  // ── Step C: Final Audit & Post-Checks ─────────────────────────────────
  const finalCov = await getMultiStoreCount();
  const { count: prodCountFinal } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCountFinal } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCountFinal } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  const { count: histCountFinal } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  const { count: identCountFinal } = await supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true });

  const finalSummary = {
    executedAt: new Date().toISOString(),
    baselineMultiStore: initialCoverage.multiStoreCount,
    finalMultiStore: finalCov.multiStoreCount,
    multiStorePercentage: ((finalCov.multiStoreCount / (prodCountFinal || 1)) * 100).toFixed(2) + '%',
    targetMet: finalCov.multiStoreCount >= 41,
    productsCount: prodCountFinal,
    variantsCount: varCountFinal,
    pricesCount: priceCountFinal,
    historyCount: histCountFinal,
    identifiersCount: identCountFinal,
    persistedFrom6S: persistedOffers.length,
    newlyDiscoveredOffers: discoveredNewOffers.length,
    details: discoveredNewOffers,
  };

  const outReportPath = path.resolve(process.cwd(), 'scripts/backfill_report_6t_final.json');
  fs.writeFileSync(outReportPath, JSON.stringify(finalSummary, null, 2));

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6T BACKFILL COMPLETE');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Canonical Products     : ${prodCountFinal} (expected ${prodCount0})`);
  console.log(`  Product Variants       : ${varCountFinal} (expected ${varCount0})`);
  console.log(`  Active Prices          : ${priceCountFinal}`);
  console.log(`  Price History Records  : ${histCountFinal}`);
  console.log(`  Store Identifiers      : ${identCountFinal}`);
  console.log(`  Multi-Store Baseline   : ${initialCoverage.multiStoreCount} (${((initialCoverage.multiStoreCount / (prodCount0 || 1)) * 100).toFixed(2)}%)`);
  console.log(`  Multi-Store Final      : ${finalCov.multiStoreCount} (${finalSummary.multiStorePercentage})`);
  console.log(`  Target Met (>= 41 / 822): ${finalSummary.targetMet ? '🎉 YES' : '❌ NO'}`);
  console.log(`  Report saved to        : ${path.basename(outReportPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error in phase3-6t-firecrawl-backfill:', err);
  process.exit(1);
});
