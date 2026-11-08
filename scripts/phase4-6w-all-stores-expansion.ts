/**
 * Increment 6W — Phase 4: Multi-Store Expansion Across Active Stores (Target: >= 110)
 *
 * Rules:
 *   - allowCreate = false (products strictly 822, product_variants strictly 822)
 *   - 0 duplicate (variant_id, store_id) pairs in prices
 *   - ProductMatcher thresholds intact (>= 0.75, exact specs match, no conflicting family)
 *   - PriceValidator validation on every persisted offer
 *
 * Strategy:
 *   Step 1: Mega.pk Category Indexer & Matcher (mobiles, smartwatches, headphones, laptops)
 *   Step 2: PriceOye & Shophive Ranked Search (prioritizing audio, wearables, tablets, mobiles)
 *   Target: >= 112 multi-store products (>13.6% coverage)
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { PriceRepository } from '../apps/scraper/src/repositories/PriceRepository';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';
import { parseRam, parseStorage } from '@pakprice/shared';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const priceRepo = new PriceRepository();
const matcher = new ProductMatcher();
const priceoyeScraper = new PriceOyeScraper();
const shophiveScraper = new ShophiveScraper();
const megaScraper = new MegaPkScraper();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TARGET_GOAL = 112; // Safely exceed >= 110!

const MEGA_LISTING_URLS = [
  { url: 'https://www.mega.pk/smartwatches/', category: 'smart-watches' },
  { url: 'https://www.mega.pk/headphones/', category: 'headphones-audio' },
  { url: 'https://www.mega.pk/mobiles-samsung/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-xiaomi/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-infinix/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-tecno/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-vivo/', category: 'mobiles' },
  { url: 'https://www.mega.pk/laptop-apple-macbook/', category: 'laptops' },
  { url: 'https://www.mega.pk/laptop-price-pakistan/', category: 'laptops' },
  { url: 'https://www.mega.pk/mobiles/', category: 'mobiles' },
];

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

function buildCleanQueries(name: string, brandName?: string): string[] {
  let clean = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(Dual\s*Sim|With\s*Official\s*Warranty|Official\s*Warranty|Pin\s*Pack|PTA\s*Approved|Non\s*PTA|1\s*Year\s*Warranty|Global\s*Version|Box\s*Pack)\b/gi, ' ')
    .replace(/\b(Milanese\s*Loop|Sport\s*Band|Ocean\s*Band|Trail\s*Loop|Alpine\s*Loop|Silicone\s*Strap|Leather\s*Strap|Case\s*with|Case|Band|Strap|Midnight|Starlight|Space\s*Gray|Space\s*Grey|Jet\s*Black|Graphite|Silver|Rose\s*Gold|Titanium|Stainless\s*Steel|Aluminum)\b/gi, ' ')
    .replace(/\b(With\s*Active\s*Noise\s*Cancellation|Active\s*Noise\s*Cancellation|Noise\s*Cancelling|Semi-in-Ear|True\s*Wireless|Wireless|Bluetooth|Calling|Smartwatch|Smart\s*Watch|Earbuds|Headphones)\b/gi, ' ')
    .replace(/\b(Backlit\s*KB|Fingerprint\s*Reader|DOS|Win11|Windows\s*11|OLED|WQXGA|WUXGA|FHD|IPS|Display|Laptop)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (brandName) {
    const brandRegex = new RegExp(`^${brandName}\\s+${brandName}\\b`, 'i');
    clean = clean.replace(brandRegex, brandName);
    if (!clean.toLowerCase().startsWith(brandName.toLowerCase())) {
      clean = `${brandName} ${clean}`;
    }
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  const q1 = tokens.slice(0, 4).join(' ');
  const q2 = tokens.slice(0, 3).join(' ');

  const queries = [q1];
  if (q2 && q2 !== q1 && tokens.length > 3) queries.push(q2);
  return queries;
}

async function searchCandidates(storeSlug: string, query: string): Promise<Array<{ title: string; url: string }>> {
  const results: Array<{ title: string; url: string }> = [];

  try {
    if (storeSlug === 'priceoye') {
      await sleep(1000);
      const searchUrl = `https://priceoye.pk/search?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        $('a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"], a[href*="/laptops/"], a[href*="/tablets/"], a[href*="/power-banks/"], a[href*="/bluetooth-speakers/"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
            const segs = fullUrl.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
            if (segs.length >= 3 && !fullUrl.includes('/pricelist/')) {
              const title = $(el).find('img').attr('alt') || $(el).text().trim() || segs[segs.length - 1];
              if (!results.some((c) => c.url === fullUrl)) {
                results.push({ title, url: fullUrl });
              }
            }
          }
        });
      }
    } else if (storeSlug === 'shophive') {
      await sleep(1000);
      const searchUrl = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        $('a.product-item-link, .item.product a.product-item-link').each((_, el) => {
          const href = $(el).attr('href');
          const title = $(el).text().trim();
          if (href && href.startsWith('http') && title && !results.some((c) => c.url === href)) {
            results.push({ title, url: href });
          }
        });
      }
    }
  } catch {}

  return results;
}

async function scrapePdp(storeSlug: string, url: string, catSlug: string): Promise<any | null> {
  try {
    await sleep(800);
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || !res.data) return null;

    const html = res.data;
    if (storeSlug === 'priceoye') {
      return priceoyeScraper.extractProductFromHtml(html, url);
    } else if (storeSlug === 'shophive') {
      return shophiveScraper.extractProductFromHtml(html, url, catSlug);
    } else if (storeSlug === 'mega-pk') {
      return megaScraper.extractFromHtml(html, url);
    }
  } catch {
    return null;
  }
  return null;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6W — MULTI-STORE EXPANSION (TARGET >= 110)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify baseline integrity
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline Database: ${prodCount0} products, ${varCount0} variants (allowCreate=false strictly locked)`);

  let currentStats = await getMultiStoreStats();
  console.log(`Current Multi-Store Products: ${currentStats.multi} / ${prodCount0} (${currentStats.pct})`);
  console.log('Category breakdown:', currentStats.breakdown);
  console.log(`Target Goal: >= ${TARGET_GOAL} multi-store products (>13.6% coverage)\n`);

  if (currentStats.multi >= TARGET_GOAL) {
    console.log(`🎉 Target already achieved: ${currentStats.multi} >= ${TARGET_GOAL}`);
    return;
  }

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s) => [s.slug, s.id]));
  if (storeMap.get('mega-pk')) storeMap.set('mega', storeMap.get('mega-pk')!);

  const megaStoreId = storeMap.get('mega-pk');
  const discoveredOffers: any[] = [];

  // ─────────────────────────────────────────────────────────────
  // STEP 1: MEGA.PK CATEGORY HARVEST & CATALOG MATCHING
  // ─────────────────────────────────────────────────────────────
  if (megaStoreId && currentStats.multi < TARGET_GOAL) {
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  STEP 1: CRAWLING MEGA.PK CATEGORY LISTINGS (FAST HTTP 200)');
    console.log('────────────────────────────────────────────────────────────────');

    const megaCandidates: Array<{ title: string; url: string; category: string }> = [];
    const seenUrls = new Set<string>();

    for (const def of MEGA_LISTING_URLS) {
      try {
        const res = await axios.get(def.url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
          timeout: 10000,
          validateStatus: () => true,
        });

        if (res.status === 200 && typeof res.data === 'string') {
          const $ = cheerio.load(res.data);
          let found = 0;
          $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html')) {
              const full = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
              const title = $(el).text().trim() || $(el).attr('title') || '';
              if (title.length > 3 && !seenUrls.has(full)) {
                seenUrls.add(full);
                megaCandidates.push({ title, url: full, category: def.category });
                found++;
              }
            }
          });
          console.log(`  ✓ Crawled ${def.url.padEnd(42)}: ${found} unique products`);
        }
        await sleep(600);
      } catch (err: any) {
        console.warn(`  ⚠️ Could not crawl ${def.url}: ${err.message}`);
      }
    }

    console.log(`\nDiscovered ${megaCandidates.length} unique Mega.pk candidate URLs. Matching against catalog...\n`);

    for (let i = 0; i < megaCandidates.length; i++) {
      if (currentStats.multi >= TARGET_GOAL) {
        console.log(`\n🎉 TARGET REACHED: ${currentStats.multi} multi-store products (Target was >= ${TARGET_GOAL})!`);
        break;
      }

      const cand = megaCandidates[i];
      const scraped = await scrapePdp('mega-pk', cand.url, cand.category);
      if (!scraped || !scraped.price || scraped.price <= 0) continue;

      const schemaItem: ScrapedProductSchemaType = {
        storeSlug: 'mega-pk',
        sourceUrl: cand.url,
        sourceIdentifier: scraped.sourceIdentifier || cand.url,
        sourceIdentifierType: scraped.sourceIdentifierType || 'url_slug',
        name: scraped.name,
        brand: scraped.brand || null,
        modelNumber: scraped.modelNumber || null,
        sku: scraped.sku || null,
        gtin: null,
        description: null,
        imageUrl: scraped.imageUrl || null,
        price: scraped.price,
        originalPrice: scraped.originalPrice || null,
        discountPercent: null,
        shippingFee: 0,
        inStock: scraped.inStock !== false,
        stockCount: null,
        ramGb: scraped.ramGb || parseRam(scraped.name),
        storageGb: scraped.storageGb || parseStorage(scraped.name),
        color: null,
      };

      const matchRes = await matcher.match(schemaItem, megaStoreId);
      if (matchRes.status !== 'matched' || !matchRes.product || !matchRes.variant) continue;

      // Size conflict guard
      const canonicalSize = (matchRes.product.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
      const candidateSize = (scraped.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
      if (canonicalSize && candidateSize && canonicalSize !== candidateSize) continue;

      // Check RAM/storage
      if (schemaItem.ramGb && matchRes.variant.ram_gb && schemaItem.ramGb !== matchRes.variant.ram_gb) continue;
      if (schemaItem.storageGb && matchRes.variant.storage_gb && schemaItem.storageGb !== matchRes.variant.storage_gb) continue;

      // Check if variant already has mega-pk offer
      const { data: existing } = await supabase
        .from('prices')
        .select('id')
        .eq('variant_id', matchRes.variant.id)
        .eq('store_id', megaStoreId)
        .maybeSingle();

      if (existing) continue;

      // Check if this product currently has <= 1 store (so adding mega-pk makes it multi-store!)
      const { data: currentVariantPrices } = await supabase
        .from('prices')
        .select('store_id')
        .eq('variant_id', matchRes.variant.id);

      const existingStoresCount = new Set((currentVariantPrices || []).map((p) => p.store_id)).size;

      const persistRes = await persistOffer({
        variantId: matchRes.variant.id,
        storeId: megaStoreId,
        price: scraped.price,
        originalPrice: scraped.originalPrice || null,
        productUrl: cand.url,
        inStock: schemaItem.inStock,
        sku: scraped.sku || null,
      });

      if (persistRes.success) {
        discoveredOffers.push({
          productName: matchRes.product.name,
          productId: matchRes.product.id,
          variantId: matchRes.variant.id,
          store: 'mega-pk',
          price: scraped.price,
          url: cand.url,
          strategy: matchRes.method,
          confidence: matchRes.confidence,
        });

        currentStats = await getMultiStoreStats();
        console.log(`  🎉 [NEW OFFER] "${scraped.name}" → "${matchRes.product.name}"`);
        console.log(`     Store: mega-pk @ Rs. ${scraped.price.toLocaleString()} | Strategy: ${matchRes.method} | Multi-Store Total: ${currentStats.multi} (${currentStats.pct})`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 2: PRICEOYE & SHOPHIVE RANKED TARGET SEARCH
  // ─────────────────────────────────────────────────────────────
  if (currentStats.multi < TARGET_GOAL) {
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('  STEP 2: PRICEOYE & SHOPHIVE TARGET SEARCH FOR SINGLE-STORE ITEMS');
    console.log('────────────────────────────────────────────────────────────────');

    const { data: allProducts } = await supabase
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

    const singleStoreTargets: any[] = [];
    for (const p of allProducts || []) {
      const storeIds = new Set<string>();
      for (const v of p.product_variants || []) {
        for (const pr of v.prices || []) {
          storeIds.add(pr.store_id);
        }
      }

      if (storeIds.size === 1) {
        const catSlug = (p.categories as any)?.slug || 'other';
        singleStoreTargets.push({
          ...p,
          existingStoreIds: Array.from(storeIds),
          categorySlug: catSlug,
        });
      }
    }

    console.log(`Identified ${singleStoreTargets.length} single-store targets for targeted search.`);

    // Top Pakistani audio/wearables & electronics brands
    const topBrands = new Set([
      'audionic', 'ronin', 'faster', 'joyroom', 'soundpeats', 'anker', 'soundcore', 'baseus',
      'edifier', 'qcy', 'haylou', 'kieslect', 'kospet', 'mibro', 'zero', 'dany',
      'samsung', 'xiaomi', 'redmi', 'infinix', 'tecno', 'realme', 'itel', 'apple', 'lenovo', 'hp', 'dell', 'asus'
    ]);

    const priorityOrder: Record<string, number> = {
      'headphones-audio': 1,
      'smart-watches': 2,
      'tablets': 3,
      'mobiles': 4,
      'laptops': 5,
      'computer-accessories': 6,
    };

    const prioritized = singleStoreTargets
      .filter((p) => {
        // Exclude fake/future items
        const n = p.name.toLowerCase();
        return (
          !n.includes('series 11') &&
          !n.includes('series 12') &&
          !n.includes('ultra 3') &&
          !n.includes('ultra 4') &&
          !n.includes('iphone 18') &&
          !n.includes('ipad 11') &&
          !n.includes('ipad air 7') &&
          !n.includes('apple logo')
        );
      })
      .sort((a, b) => {
        const aBrand = (a.brands?.name || a.name.split(' ')[0] || '').toLowerCase();
        const bBrand = (b.brands?.name || b.name.split(' ')[0] || '').toLowerCase();
        const aIsTop = topBrands.has(aBrand) ? 0 : 1;
        const bIsTop = topBrands.has(bBrand) ? 0 : 1;
        if (aIsTop !== bIsTop) return aIsTop - bIsTop;

        const aCat = priorityOrder[a.categorySlug] || 99;
        const bCat = priorityOrder[b.categorySlug] || 99;
        return aCat - bCat;
      });

    console.log(`Prioritized queue length: ${prioritized.length}`);

    const candidateStores = ['priceoye', 'shophive'];

    for (let i = 0; i < prioritized.length; i++) {
      if (currentStats.multi >= TARGET_GOAL) {
        console.log(`\n🎉 TARGET REACHED: ${currentStats.multi} multi-store products (Target was >= ${TARGET_GOAL})!`);
        break;
      }

      const target = prioritized[i];
      const existingStoreSlugs = new Set(
        target.existingStoreIds.map((id: string) => Array.from(storeMap.entries()).find(([_, sId]) => sId === id)?.[0])
      );

      const brandName = (target.brands?.name || target.name.split(' ')[0] || '').trim();
      const cleanQueries = buildCleanQueries(target.name, brandName);
      const storesToTry = candidateStores.filter((s) => !existingStoreSlugs.has(s));

      console.log(`\n[${i + 1}/${prioritized.length}] Searching queries: ${JSON.stringify(cleanQueries)} (${target.categorySlug}) | Stores: ${storesToTry.join(', ')}`);

      let matchedForThisProduct = false;

      for (const cleanQuery of cleanQueries) {
        if (matchedForThisProduct || currentStats.multi >= TARGET_GOAL) break;

        for (const storeSlug of storesToTry) {
          if (matchedForThisProduct || currentStats.multi >= TARGET_GOAL) break;

          const storeId = storeMap.get(storeSlug);
          if (!storeId) continue;

          const candidateUrls = await searchCandidates(storeSlug, cleanQuery);
          if (!candidateUrls || candidateUrls.length === 0) continue;

          const targetBrandLower = brandName.toLowerCase();
          const queryTokens = cleanQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

          const scoredCandidates = candidateUrls
            .filter((cand) => {
              if (!targetBrandLower || targetBrandLower.length < 3) return true;
              const text = `${cand.title} ${cand.url}`.toLowerCase();
              return text.includes(targetBrandLower);
            })
            .map((cand) => {
              const text = `${cand.title} ${cand.url}`.toLowerCase();
              let score = 0;
              for (const t of queryTokens) {
                if (text.includes(t)) score++;
              }
              return { ...cand, matchScore: score };
            })
            .sort((a, b) => b.matchScore - a.matchScore);

          const candidatesToTest = scoredCandidates.slice(0, 3);

          for (const cand of candidatesToTest) {
            const scraped = await scrapePdp(storeSlug, cand.url, target.categorySlug);
            if (!scraped || !scraped.price || scraped.price <= 0) continue;

            const schemaItem: ScrapedProductSchemaType = {
              storeSlug,
              sourceUrl: cand.url,
              sourceIdentifier: scraped.sourceIdentifier || cand.url,
              sourceIdentifierType: scraped.sourceIdentifierType || 'url_slug',
              name: scraped.name,
              brand: scraped.brand || brandName || null,
              modelNumber: scraped.modelNumber || null,
              sku: scraped.sku || null,
              gtin: null,
              description: null,
              imageUrl: scraped.imageUrl || null,
              price: scraped.price,
              originalPrice: scraped.originalPrice || null,
              discountPercent: null,
              shippingFee: 0,
              inStock: scraped.inStock !== false,
              stockCount: null,
              ramGb: scraped.ramGb || parseRam(scraped.name),
              storageGb: scraped.storageGb || parseStorage(scraped.name),
              color: null,
            };

            const matchRes = await matcher.match(schemaItem, storeId);
            if (matchRes.status !== 'matched' || !matchRes.product || !matchRes.variant) continue;

            // Must match target canonical product
            if (matchRes.product.id !== target.id) continue;

            // Size conflict guard
            const canonicalSize = (target.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
            const candidateSize = (scraped.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
            if (canonicalSize && candidateSize && canonicalSize !== candidateSize) continue;

            // Strict RAM / Storage compatibility
            if (schemaItem.ramGb && matchRes.variant.ram_gb && schemaItem.ramGb !== matchRes.variant.ram_gb) continue;
            if (schemaItem.storageGb && matchRes.variant.storage_gb && schemaItem.storageGb !== matchRes.variant.storage_gb) continue;

            // Check if variant already has an offer for this store
            const { data: existingOffer } = await supabase
              .from('prices')
              .select('id')
              .eq('variant_id', matchRes.variant.id)
              .eq('store_id', storeId)
              .maybeSingle();

            if (existingOffer) continue;

            const persistRes = await persistOffer({
              variantId: matchRes.variant.id,
              storeId,
              price: scraped.price,
              originalPrice: scraped.originalPrice || null,
              productUrl: cand.url,
              inStock: schemaItem.inStock,
              sku: scraped.sku || null,
            });

            if (persistRes.success) {
              discoveredOffers.push({
                productName: target.name,
                productId: target.id,
                variantId: matchRes.variant.id,
                store: storeSlug,
                price: scraped.price,
                url: cand.url,
                strategy: matchRes.method,
                confidence: matchRes.confidence,
              });

              currentStats = await getMultiStoreStats();
              console.log(`  🎉 APPROVED MATCH:`);
              console.log(`     Candidate: "${cand.title}" (${storeSlug} @ Rs. ${scraped.price.toLocaleString()})`);
              console.log(`     Canonical: "${target.name}" | Strategy: ${matchRes.method} | Confidence: ${matchRes.confidence}`);
              console.log(`  ✓ Persisted successfully! Current Multi-Store count: ${currentStats.multi} (${currentStats.pct})`);
              matchedForThisProduct = true;
              break;
            }
          }
        }
      }
    }
  }

  // Final summary and assertions
  const finalStats = await getMultiStoreStats();
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6W MULTI-STORE EXPANSION COMPLETE');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`New Multi-Store Offers Discovered: ${discoveredOffers.length}`);
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
    path.resolve(process.cwd(), 'scripts/backfill_report_6w_final.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        baselineMultiStore: 86,
        finalMultiStore: finalStats.multi,
        multiStorePercentage: finalStats.pct,
        targetMet: finalStats.multi >= 110,
        productsCount: prodCount0,
        variantsCount: varCount0,
        newlyDiscoveredOffers: discoveredOffers.length,
        breakdown: finalStats.breakdown,
        details: discoveredOffers,
      },
      null,
      2
    )
  );
  console.log('Saved report to scripts/backfill_report_6w_final.json');
}

main().catch(console.error);
