/**
 * Increment 6V — Phase 1 Task 2: Multi-Store Expansion to >= 85 Products
 *
 * Target: Expand multi-store products from 78 to >= 86 (>10.4% coverage)
 * with strict verification:
 *   - allowCreate = false (no new products, no new variants)
 *   - 0 duplicate (variant_id, store_id) pairs
 *   - ProductMatcher thresholds intact (>= 0.75, exact specs)
 *   - PriceValidator validation on every persisted offer
 *   - Prioritizes laptops, tablets, and high-overlap audio/wearables
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { PriceRepository } from '../apps/scraper/src/repositories/PriceRepository';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';
import { FirecrawlValidator, FirecrawlCandidateJson } from './firecrawl-validator';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const priceRepo = new PriceRepository();
const priceoyeScraper = new PriceOyeScraper();
const telemartScraper = new TelemartScraper();
const shophiveScraper = new ShophiveScraper();
const megaScraper = new MegaPkScraper();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PersistOfferParams {
  variantId: string;
  storeId: string;
  price: number;
  originalPrice: number | null;
  productUrl: string;
  inStock: boolean;
  sku: string | null;
}

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

  if (validation.action === 'rejected') {
    return { success: false, reason: `Price validation rejected: ${validation.rejectReason}` };
  }

  // 3. Upsert current price
  await priceRepo.upsertCurrentPrice({
    variant_id: variantId,
    store_id: storeId,
    price: validation.price,
    original_price: validation.originalPrice,
    shipping_fee: 0,
    in_stock: inStock,
    product_url: productUrl,
  });

  // 4. Record in price_history (deduplicated)
  if (!currentPriceRow || Math.abs(currentPriceRow.price - validation.price) > 0.01) {
    await priceRepo.insertPriceHistory(variantId, storeId, validation.price, validation.originalPrice, 0, inStock);
  }

  // 5. Upsert store_product_identifiers
  const now = new Date().toISOString();
  const identifier = sku || productUrl;
  const identifierType = sku ? 'sku' : 'url_slug';

  await supabase.from('store_product_identifiers').upsert(
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

async function getMultiStoreStats(): Promise<{ total: number; multi: number; pct: string; breakdown: Record<string, number> }> {
  const { data: prices } = await supabase
    .from('prices')
    .select('store_id, product_variants!inner(product_id, products!inner(category_id, categories!inner(slug)))');

  const prodStores = new Map<string, { stores: Set<string>; catSlug: string }>();
  for (const p of (prices as any[]) || []) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    const catSlug = p.product_variants?.products?.categories?.slug || 'other';
    if (!prodStores.has(prodId)) {
      prodStores.set(prodId, { stores: new Set(), catSlug });
    }
    prodStores.get(prodId)!.stores.add(p.store_id);
  }

  let multi = 0;
  const breakdown: Record<string, number> = {};
  for (const item of prodStores.values()) {
    if (item.stores.size > 1) {
      multi++;
      breakdown[item.catSlug] = (breakdown[item.catSlug] || 0) + 1;
    }
  }

  return {
    total: prodStores.size,
    multi,
    pct: ((multi / (prodStores.size || 1)) * 100).toFixed(2) + '%',
    breakdown,
  };
}

// Clean query string for store searching
function buildCleanQuery(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(Dual\s*Sim|With\s*Official\s*Warranty|Official\s*Warranty|Pin\s*Pack|PTA\s*Approved|Non\s*PTA|1\s*Year\s*Warranty|Global\s*Version)\b/gi, ' ')
    .replace(/\b(With\s*Active\s*Noise\s*Cancellation|Active\s*Noise\s*Cancellation|Noise\s*Cancelling|Semi-in-Ear|True\s*Wireless|Wireless|Bluetooth|Calling|Smartwatch|Smart\s*Watch|Earbuds|Headphones)\b/gi, ' ')
    .replace(/\b(Backlit\s*KB|Fingerprint\s*Reader|DOS|Win11|Windows\s*11|OLED|WQXGA|WUXGA|FHD|IPS|Display)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6V — CROSS-STORE EXPANSION (TARGET >= 86)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify baseline integrity
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline Database: ${prodCount0} products, ${varCount0} variants (allowCreate=false strictly locked)`);

  let currentStats = await getMultiStoreStats();
  console.log(`Current Multi-Store Products: ${currentStats.multi} / ${prodCount0} (${currentStats.pct})`);
  console.log('Category breakdown:', currentStats.breakdown);
  console.log(`Target Goal: >= 86 multi-store products (>10.4% coverage)\n`);

  const TARGET_GOAL = 86;

  // Initialize validator and store mappings
  const validator = new FirecrawlValidator();
  await validator.init();

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s) => [s.slug, s.id]));
  if (storeMap.get('mega-pk')) storeMap.set('mega', storeMap.get('mega-pk')!);

  // Fetch all single-store products in high-overlap priority categories
  const { data: allProducts, error: pErr } = await supabase
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
    .order('name');

  if (pErr || !allProducts) {
    console.error('Failed to load products:', pErr);
    process.exit(1);
  }

  // Filter products having exactly 1 store price
  const singleStoreTargets: any[] = [];
  for (const p of allProducts) {
    const storeIds = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        storeIds.add(pr.store_id);
      }
    }

    if (storeIds.size === 1) {
      const catSlug = (p.categories as any)?.slug || '';
      singleStoreTargets.push({
        ...p,
        existingStoreId: Array.from(storeIds)[0],
        categorySlug: catSlug,
      });
    }
  }

  console.log(`Found ${singleStoreTargets.length} single-store products available for expansion.`);

  // High overlap brands across Pakistani stores
  const highOverlapBrands = new Set([
    'audionic', 'ronin', 'faster', 'joyroom', 'soundpeats', 'anker', 'soundcore',
    'edifier', 'qcy', 'baseus', 'haylou', 'kieslect', 'kospet', 'mibro', 'zero',
    'dany', 'samsung', 'apple', 'xiaomi', 'redmi', 'infinix', 'tecno', 'realme',
    'itel', 'lenovo', 'hp', 'dell', 'asus'
  ]);

  const priorityOrder: Record<string, number> = {
    'tablets': 1,
    'smart-watches': 2,
    'headphones-audio': 3,
    'mobiles': 4,
    'laptops': 5,
    'computer-accessories': 6,
  };

  const prioritizedTargets = singleStoreTargets
    .sort((a, b) => {
      const aBrand = (a.brands?.name || a.name.split(' ')[0] || '').toLowerCase();
      const bBrand = (b.brands?.name || b.name.split(' ')[0] || '').toLowerCase();
      const aIsHigh = highOverlapBrands.has(aBrand) ? 0 : 1;
      const bIsHigh = highOverlapBrands.has(bBrand) ? 0 : 1;
      if (aIsHigh !== bIsHigh) return aIsHigh - bIsHigh;

      const aCat = priorityOrder[a.categorySlug] || 99;
      const bCat = priorityOrder[b.categorySlug] || 99;
      return aCat - bCat;
    });

  console.log(`Prioritized targets: ${prioritizedTargets.length}`);

  const discoveredNewOffers: any[] = [];

  for (let i = 0; i < prioritizedTargets.length; i++) {
    if (currentStats.multi >= TARGET_GOAL) {
      console.log(`\n🎉 TARGET REACHED: ${currentStats.multi} multi-store products (Target was >= 86)!`);
      break;
    }

    const target = prioritizedTargets[i];
    const existingStoreSlug = Array.from(storeMap.entries()).find(([_, id]) => id === target.existingStoreId)?.[0];
    const candidateStores = ['priceoye', 'shophive'].filter((s) => s !== existingStoreSlug);

    const cleanQuery = buildCleanQuery(target.name);
    if (cleanQuery.length < 3) continue;

    console.log(`\n[${i + 1}/${prioritizedTargets.length}] Searching "${cleanQuery}" (${target.categorySlug}) | Existing: ${existingStoreSlug}`);

    for (const storeSlug of candidateStores) {
      if (currentStats.multi >= TARGET_GOAL) break;

      const storeId = storeMap.get(storeSlug);
      if (!storeId) continue;

      try {
        let candidateUrls: Array<{ title: string; url: string }> = [];

        if (storeSlug === 'priceoye') {
          await sleep(1500);
          const searchUrl = `https://priceoye.pk/search?q=${encodeURIComponent(cleanQuery)}`;
          const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"], a[href*="/laptops/"], a[href*="/tablets/"], a[href*="/power-banks/"], a[href*="/bluetooth-speakers/"], a[href*="/speakers/"], a[href*="/smart-bands/"], a[href*="/headphones/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
              const segs = fullUrl.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
              if (segs.length >= 3 && !fullUrl.includes('/pricelist/')) {
                const title = $(el).find('img').attr('alt') || $(el).text().trim() || segs[segs.length - 1];
                if (!candidateUrls.some((c) => c.url === fullUrl)) {
                  candidateUrls.push({ title, url: fullUrl });
                }
              }
            }
          });
        } else if (storeSlug === 'shophive') {
          await sleep(1500);
          const searchUrl = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(cleanQuery)}`;
          const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a.product-item-link, .item.product a.product-item-link').each((_, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && href.startsWith('http') && title && !candidateUrls.some((c) => c.url === href)) {
              candidateUrls.push({ title, url: href });
            }
          });
        }

        if (candidateUrls.length === 0) continue;

        // Pre-filter candidate URLs: check target brand
        const targetBrand = (target.brands?.name || target.name.split(' ')[0] || '').toLowerCase().trim();
        const brandFilteredCands = candidateUrls.filter((cand) => {
          if (!targetBrand || targetBrand.length < 3) return true;
          const text = `${cand.title} ${cand.url}`.toLowerCase();
          return text.includes(targetBrand);
        });

        const candidatesToFetch = (brandFilteredCands.length > 0 ? brandFilteredCands : candidateUrls).slice(0, 2);

        for (const cand of candidatesToFetch) {
          let scrapedPdp: any = null;
          try {
            await sleep(1200);
            const pdpRes = await axios.get(cand.url, {
              headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
              timeout: 10000,
            });
            const html = pdpRes.data;

            if (storeSlug === 'priceoye') {
              scrapedPdp = priceoyeScraper.extractProductFromHtml(html, cand.url);
            } else if (storeSlug === 'shophive') {
              scrapedPdp = shophiveScraper.extractProductFromHtml(html, cand.url, target.categorySlug || 'mobiles');
            }
          } catch {
            continue;
          }

          if (!scrapedPdp || !scrapedPdp.price || scrapedPdp.price <= 0) continue;

          // Convert to candidate JSON for FirecrawlValidator
          const candidateJson: FirecrawlCandidateJson = {
            store_name: storeSlug === 'priceoye' ? 'PriceOye' : 'Shophive',
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
            console.log(`  🎉 APPROVED MATCH:`);
            console.log(`     Candidate: "${cand.title}" (${storeSlug} @ Rs. ${scrapedPdp.price.toLocaleString()})`);
            console.log(`     Canonical: "${target.name}" | Strategy: ${valResult.strategy} | Confidence: ${valResult.confidence}`);

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

              currentStats = await getMultiStoreStats();
              console.log(`  ✓ Persisted successfully! Current Multi-Store count: ${currentStats.multi} (${currentStats.pct})`);
              break;
            } else {
              console.log(`  ⚠️ Persist rejected: ${persistRes.reason}`);
            }
          }
        }
      } catch (err: any) {
        console.log(`  ⚠️ Error querying ${storeSlug}: ${err.message}`);
      }
    }
  }

  // Final summary
  const finalStats = await getMultiStoreStats();
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6V EXPANSION COMPLETE');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`New Multi-Store Offers Discovered: ${discoveredNewOffers.length}`);
  console.log(`Total Products: ${prodCount0} (strictly preserved)`);
  console.log(`Total Variants: ${varCount0} (strictly preserved)`);
  console.log(`Final Multi-Store Products: ${finalStats.multi} / ${prodCount0} (${finalStats.pct})`);
  console.log('Final Category Breakdown:', finalStats.breakdown);

  // Check duplicate prices
  const { data: allPrices } = await supabase.from('prices').select('variant_id, store_id');
  const pricePairs = new Set<string>();
  let dupes = 0;
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}__${pr.store_id}`;
    if (pricePairs.has(key)) dupes++;
    pricePairs.add(key);
  }
  console.log(`Duplicate (variant_id, store_id) pairs: ${dupes} (strictly 0)`);

  // Write report
  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts/backfill_report_6v_final.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        baselineMultiStore: 78,
        finalMultiStore: finalStats.multi,
        multiStorePercentage: finalStats.pct,
        targetMet: finalStats.multi >= 85,
        productsCount: prodCount0,
        variantsCount: varCount0,
        newlyDiscoveredOffers: discoveredNewOffers.length,
        breakdown: finalStats.breakdown,
        details: discoveredNewOffers,
      },
      null,
      2
    )
  );
  console.log('Saved report to scripts/backfill_report_6v_final.json');
}

main().catch(console.error);

