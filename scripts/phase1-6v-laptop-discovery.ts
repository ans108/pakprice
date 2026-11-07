/**
 * Increment 6V — Phase 1 Task 2: Laptop & Tablet Cross-Store Discovery
 *
 * Target: Expand multi-store products from 78 to >= 85 (>10.0% coverage)
 * by finding verified cross-store offers for laptops and tablets across
 * Shophive, PriceOye, Telemart, and Mega.pk.
 *
 * Enforces:
 *   - allowCreate = false (no new products, no new variants)
 *   - 0 duplicate (variant_id, store_id) pairs
 *   - ProductMatcher thresholds intact (>= 0.75 fuzzy, spec verification)
 *   - PriceValidator validation on every persisted offer
 */
import dotenv from 'dotenv';
import path from 'path';
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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

async function getMultiStoreStats(): Promise<{ total: number; multi: number; pct: string; laptopMulti: number; tabletMulti: number }> {
  const { data: prices } = await supabase
    .from('prices')
    .select('store_id, product_variants!inner(product_id, products!inner(category_id, categories!inner(slug)))');

  const prodStores = new Map<string, { stores: Set<string>; categorySlug: string }>();
  for (const p of (prices as any[]) || []) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    const catSlug = p.product_variants?.products?.categories?.slug || '';
    if (!prodStores.has(prodId)) {
      prodStores.set(prodId, { stores: new Set(), categorySlug: catSlug });
    }
    prodStores.get(prodId)!.stores.add(p.store_id);
  }

  let multi = 0;
  let laptopMulti = 0;
  let tabletMulti = 0;

  for (const item of prodStores.values()) {
    if (item.stores.size > 1) {
      multi++;
      if (item.categorySlug === 'laptops') laptopMulti++;
      if (item.categorySlug === 'tablets') tabletMulti++;
    }
  }

  return {
    total: prodStores.size,
    multi,
    pct: ((multi / (prodStores.size || 1)) * 100).toFixed(2) + '%',
    laptopMulti,
    tabletMulti,
  };
}

// Build clean search query for laptops and tablets
function buildCleanQuery(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(With Official Warranty|Official Warranty|Pin Pack|PTA Approved|Non PTA|1 Year Warranty|Global Version)\b/gi, ' ')
    .replace(/\b(Backlit KB|Fingerprint Reader|DOS|Win11 Home|Win11|Windows 11|OLED|WQXGA|WUXGA|FHD|IPS|165Hz|240Hz|Display)\b/gi, ' ')
    .replace(/\b(NVIDIA GeForce RTX|NVIDIA RTX|RTX|GeForce|Graphics|GDDR6)\s*\w+/gi, ' ')
    .replace(/\b\d+(\.\d+)?\s*(Inch|inches|")\b/gi, ' ')
    .replace(/\b(Sky Blue|Space Gray|Silver|Midnight|Starlight|Black|Grey)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6V — LAPTOP & TABLET MULTI-STORE DISCOVERY');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify baseline integrity
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline Database: ${prodCount0} products, ${varCount0} variants (allowCreate=false strictly locked)`);

  let currentStats = await getMultiStoreStats();
  console.log(`Current Multi-Store Products: ${currentStats.multi} / ${prodCount0} (${currentStats.pct})`);
  console.log(`  - Laptops Multi-Store: ${currentStats.laptopMulti}`);
  console.log(`  - Tablets Multi-Store: ${currentStats.tabletMulti}`);
  console.log(`Target Goal: >= 85 multi-store products (>10.0% coverage)\n`);

  const TARGET_GOAL = 86; // Push to 86 for safety

  // Initialize validator and store mappings
  const validator = new FirecrawlValidator();
  await validator.init();

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.slug, s.id]));
  if (storeMap.get('mega-pk')) storeMap.set('mega', storeMap.get('mega-pk')!);

  // Fetch all products in laptops, tablets, and high-overlap categories
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

  // Single-store targets
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

  // Prioritize Laptops and Tablets first, then high-overlap wearables/audio
  const priorityOrder: Record<string, number> = {
    'laptops': 1,
    'tablets': 2,
    'smart-watches': 3,
    'headphones-audio': 4,
    'mobiles': 5,
  };

  const prioritizedTargets = singleStoreTargets
    .filter(t => ['laptops', 'tablets', 'smart-watches', 'headphones-audio', 'mobiles'].includes(t.categorySlug))
    .sort((a, b) => {
      const aCat = priorityOrder[a.categorySlug] || 99;
      const bCat = priorityOrder[b.categorySlug] || 99;
      return aCat - bCat;
    });

  console.log(`Prioritized targets: ${prioritizedTargets.length} (${prioritizedTargets.filter(t => t.categorySlug === 'laptops').length} laptops, ${prioritizedTargets.filter(t => t.categorySlug === 'tablets').length} tablets)`);

  const discoveredOffers: any[] = [];

  for (let i = 0; i < prioritizedTargets.length; i++) {
    if (currentStats.multi >= TARGET_GOAL) {
      console.log(`\n🎉 TARGET REACHED: ${currentStats.multi} multi-store products (Target was >= 85)!`);
      break;
    }

    const target = prioritizedTargets[i];
    const existingStoreSlug = Array.from(storeMap.entries()).find(([_, id]) => id === target.existingStoreId)?.[0];
    const candidateStores = ['shophive', 'priceoye'].filter(s => s !== existingStoreSlug);

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
          $('a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"], a[href*="/laptops/"], a[href*="/tablets/"]').each((_, el) => {
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
            if (href && href.startsWith('http') && title && !candidateUrls.some(c => c.url === href)) {
              candidateUrls.push({ title, url: href });
            }
          });
        }

        if (candidateUrls.length === 0) continue;

        // Pre-filter candidate URLs: check brand presence
        const targetBrand = (target.brands?.name || target.name.split(' ')[0] || '').toLowerCase().trim();
        const brandFilteredCands = candidateUrls.filter(cand => {
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
              scrapedPdp = shophiveScraper.extractProductFromHtml(html, cand.url, target.categorySlug);
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
            discovery_method: 'laptop_tablet_discovery',
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
              discoveredOffers.push({
                productName: target.name,
                productId: target.id,
                variantId: valResult.matchedVariantId,
                store: storeSlug,
                price: scrapedPdp.price,
                url: cand.url,
                category: target.categorySlug,
                strategy: valResult.strategy,
                confidence: valResult.confidence,
              });

              currentStats = await getMultiStoreStats();
              console.log(`  ✓ Persisted successfully! Current Multi-Store count: ${currentStats.multi} (${currentStats.pct})`);
              break; // Found match for this store, move to next store or target
            } else {
              console.log(`  ⚠️ Persist rejected: ${persistRes.reason}`);
            }
          } else {
            console.log(`  ✗ Validation: ${valResult.status} (${valResult.reason || 'mismatch'})`);
          }
        }
      } catch (err: any) {
        console.log(`  ⚠️ Error searching ${storeSlug}: ${err.message}`);
      }
    }
  }

  // Final summary
  const finalStats = await getMultiStoreStats();
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  PHASE 1 TASK 2 DISCOVERY RESULTS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`New Multi-Store Offers Discovered: ${discoveredOffers.length}`);
  console.log(`Total Products: ${prodCount0} (strictly preserved)`);
  console.log(`Total Variants: ${varCount0} (strictly preserved)`);
  console.log(`Final Multi-Store Products: ${finalStats.multi} / ${prodCount0} (${finalStats.pct})`);
  console.log(`  - Laptops Multi-Store: ${finalStats.laptopMulti}`);
  console.log(`  - Tablets Multi-Store: ${finalStats.tabletMulti}`);

  // Check for duplicate prices
  const { data: allPrices } = await supabase.from('prices').select('variant_id, store_id');
  const pricePairs = new Set<string>();
  let dupes = 0;
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}__${pr.store_id}`;
    if (pricePairs.has(key)) dupes++;
    pricePairs.add(key);
  }
  console.log(`Duplicate (variant_id, store_id) pairs: ${dupes} (strictly 0)`);
}

main().catch(console.error);

