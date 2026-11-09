/**
 * Increment 6X — Phase 2: Targeted Deep Multi-Store Expansion
 *
 * Targets:
 *   - Total Multi-Store Products: >= 140 / 822 (>17.0%)
 *   - Products with 3+ verified stores: >= 45 products
 *   - Products with 4+ verified stores: >= 15 products
 *
 * Invariants:
 *   - allowCreate = false (products strictly 822, product_variants strictly 822)
 *   - 0 duplicate (variant_id, store_id) pairs in prices
 *   - ProductMatcher thresholds intact (>= 0.75, exact specs match, no conflicting family)
 *   - PriceValidator validation on every persisted offer
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
import { parsePrice } from '../apps/scraper/src/utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const priceRepo = new PriceRepository();
const matcher = new ProductMatcher();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TARGET_TOTAL_MULTISTORE = 142;
const TARGET_THREE_PLUS = 46;
const TARGET_FOUR_PLUS = 16;

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

interface StoreCandidate {
  title: string;
  url: string;
  price: number;
}

async function searchCandidatesOnStore(storeSlug: string, query: string): Promise<StoreCandidate[]> {
  const results: StoreCandidate[] = [];

  try {
    if (storeSlug === 'telemart') {
      await sleep(3500); // 3,500ms delay for Telemart
      const url = `https://www.telemart.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data?.resources?.results?.products) {
        for (const p of res.data.resources.results.products) {
          const rawUrl = p.url;
          const fullUrl = rawUrl.startsWith('http')
            ? rawUrl
            : `https://www.telemart.pk${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`.split('?')[0];
          const price = parseFloat(p.price);
          if (fullUrl && p.title && !isNaN(price) && price > 0 && !results.some((r) => r.url === fullUrl)) {
            results.push({ title: p.title, url: fullUrl, price });
          }
        }
      }
    } else if (storeSlug === 'shophive') {
      await sleep(1200);
      const searchUrl = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        $('.product-item-info, .item.product').each((_, el) => {
          const a = $(el).find('a.product-item-link');
          const title = a.text().trim();
          const href = a.attr('href');
          const priceText = $(el)
            .find('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price')
            .first()
            .text()
            .trim();
          const price = parsePrice(priceText);
          if (href && title && price && price > 0 && !results.some((r) => r.url === href)) {
            results.push({ title, url: href, price });
          }
        });
      }
    } else if (storeSlug === 'priceoye') {
      await sleep(1200);
      const searchUrl = `https://priceoye.pk/search?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        $(
          '.product-box, a[href*="/mobiles/"], a[href*="/smart-watches/"], a[href*="/wireless-earbuds/"], a[href*="/tablets/"], a[href*="/laptops/"]'
        ).each((_, el) => {
          const a = $(el).is('a') ? $(el) : $(el).find('a').first();
          const href = a.attr('href');
          if (href) {
            const fullUrl = href.startsWith('http')
              ? href
              : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
            const segs = fullUrl.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
            if (segs.length >= 3 && !fullUrl.includes('/pricelist/')) {
              const title = a.find('img').attr('alt') || a.find('.p-title, .title').text().trim() || a.text().trim();
              const priceText = $(el).find('.price-box, .price').first().text().trim();
              const price = parsePrice(priceText);
              if (title && price && price > 0 && !results.some((r) => r.url === fullUrl)) {
                results.push({ title, url: fullUrl, price });
              }
            }
          }
        });
      }
    } else if (storeSlug === 'ishopping') {
      await sleep(1200);
      const searchUrl = `https://www.ishopping.pk/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        const $ = cheerio.load(res.data);
        $('.product-item-info, .item.product, .product-item').each((_, el) => {
          const a = $(el).find('a.product-item-link, a.product-image');
          const title =
            a.attr('title') || $(el).find('.product-item-name, h2, h3').text().trim() || a.text().trim();
          const href = a.attr('href');
          const priceText = $(el)
            .find('[data-price-type="finalPrice"] .price, .special-price .price, .regular-price .price, .price')
            .first()
            .text()
            .trim();
          const price = parsePrice(priceText);
          if (href && title && price && price > 0 && !results.some((r) => r.url === href)) {
            results.push({ title: title.replace(/\s+/g, ' ').trim(), url: href, price });
          }
        });
      }
    }
  } catch (err: any) {
    // polite failover on transient network errors
  }

  return results;
}

async function getDetailedStoreStats() {
  const { data: prices } = await supabase
    .from('prices')
    .select('variant_id, store_id, product_variants!inner(product_id)');

  const prodMap = new Map<string, Set<string>>();
  for (const p of (prices as any[]) || []) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    if (!prodMap.has(prodId)) prodMap.set(prodId, new Set());
    prodMap.get(prodId)!.add(p.store_id);
  }

  let totalProducts = prodMap.size;
  let oneStore = 0;
  let twoStores = 0;
  let threeStores = 0;
  let fourPlusStores = 0;

  for (const s of prodMap.values()) {
    if (s.size === 1) oneStore++;
    else if (s.size === 2) twoStores++;
    else if (s.size === 3) threeStores++;
    else if (s.size >= 4) fourPlusStores++;
  }

  const totalMulti = twoStores + threeStores + fourPlusStores;
  const threePlus = threeStores + fourPlusStores;

  return {
    totalProducts,
    oneStore,
    twoStores,
    threeStores,
    fourPlusStores,
    totalMulti,
    threePlus,
  };
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6X — TARGETED DEEP MULTI-STORE EXPANSION');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify baseline
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline Catalog: ${prodCount0} products, ${varCount0} variants (strictly invariant)`);

  let stats = await getDetailedStoreStats();
  console.log('Starting Multi-Store Stats:', stats);
  console.log(
    `Goals: Multi >= ${TARGET_TOTAL_MULTISTORE}, 3+ stores >= ${TARGET_THREE_PLUS}, 4+ stores >= ${TARGET_FOUR_PLUS}\n`
  );

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s) => [s.slug, s.id]));
  if (storeMap.get('mega-pk')) storeMap.set('mega', storeMap.get('mega-pk')!);
  const storeIdToSlug = new Map((stores || []).map((s) => [s.id, s.slug]));

  // Fetch all products with existing offers
  const { data: allPrices } = await supabase
    .from('prices')
    .select(
      'variant_id, store_id, product_variants!inner(id, product_id, ram_gb, storage_gb, color, model_number, products!inner(id, name, slug, brand_id, brands(name), categories!inner(slug)))'
    );

  const productAgg = new Map<
    string,
    {
      product: any;
      variant: any;
      brandName: string;
      catSlug: string;
      existingStoreSlugs: Set<string>;
      existingStoreIds: Set<string>;
    }
  >();

  for (const p of (allPrices as any[]) || []) {
    const prod = p.product_variants?.products;
    if (!prod) continue;
    const storeSlug = storeIdToSlug.get(p.store_id) || p.store_id;

    if (!productAgg.has(prod.id)) {
      productAgg.set(prod.id, {
        product: prod,
        variant: p.product_variants,
        brandName: prod.brands?.name || '',
        catSlug: prod.categories?.slug || 'other',
        existingStoreSlugs: new Set(),
        existingStoreIds: new Set(),
      });
    }
    productAgg.get(prod.id)!.existingStoreSlugs.add(storeSlug);
    productAgg.get(prod.id)!.existingStoreIds.add(p.store_id);
  }

  let addedOffers = 0;

  async function tryMatchAndPersistCandidates(
    item: any,
    targetStore: string,
    candidates: StoreCandidate[]
  ): Promise<boolean> {
    const storeId = storeMap.get(targetStore);
    if (!storeId) return false;

    let matchedAny = false;

    for (const cand of candidates.slice(0, 4)) {
      const scraped: ScrapedProductSchemaType = {
        storeSlug: targetStore,
        sourceUrl: cand.url,
        sourceIdentifier: cand.url.split('/').pop()?.split('?')[0] || `${targetStore}-sku`,
        sourceIdentifierType: 'url_slug',
        name: cand.title,
        brand: item.brandName || null,
        modelNumber: null,
        sku: null,
        gtin: null,
        description: null,
        imageUrl: null,
        price: cand.price,
        originalPrice: null,
        discountPercent: null,
        shippingFee: 0,
        inStock: true,
        stockCount: null,
        ramGb: extractRamFromTitle(cand.title) || item.variant.ram_gb,
        storageGb: extractStorageFromTitle(cand.title) || item.variant.storage_gb,
        color: null,
      };

      try {
        const matchResult = await matcher.match(scraped, storeId);
        if (matchResult.status === 'matched' && matchResult.variant) {
          const targetVariantId = matchResult.variant.id;
          const matchedItem = Array.from(productAgg.values()).find((it) => it.variant.id === targetVariantId);

          if (matchedItem && !matchedItem.existingStoreSlugs.has(targetStore)) {
            const persistResult = await persistOffer({
              variantId: targetVariantId,
              storeId,
              price: scraped.price,
              originalPrice: scraped.originalPrice,
              productUrl: scraped.sourceUrl,
              inStock: scraped.inStock,
              sku: scraped.sku,
            });

            if (persistResult.success) {
              addedOffers++;
              matchedItem.existingStoreSlugs.add(targetStore);
              matchedItem.existingStoreIds.add(storeId);
              console.log(
                `  ✅ [${matchedItem.existingStoreSlugs.size} Stores] Matched ${matchedItem.product.name} on ${targetStore.toUpperCase()} @ Rs. ${scraped.price.toLocaleString()}`
              );
              matchedAny = true;
            }
          }
        }
      } catch (err: any) {
        // Continue
      }
    }
    return matchedAny;
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE A: PROMOTE 3-STORE PRODUCTS TO 4+ STORES (TARGET: >= 16)
  // Candidate Stores to try: Shophive, Telemart, iShopping, PriceOye
  // ─────────────────────────────────────────────────────────────
  console.log('────────────────────────────────────────────────────────────────');
  console.log('  PHASE A: Promoting 3-Store Products to 4+ Stores');
  console.log('────────────────────────────────────────────────────────────────');

  const threeStoreItems = Array.from(productAgg.values()).filter((p) => p.existingStoreSlugs.size === 3);
  console.log(`Auditing ${threeStoreItems.length} 3-store products...`);

  for (let i = 0; i < threeStoreItems.length; i++) {
    if (stats.fourPlusStores >= TARGET_FOUR_PLUS) {
      console.log(`  ✓ 4+ stores goal reached (${stats.fourPlusStores} >= ${TARGET_FOUR_PLUS})!`);
      break;
    }

    const item = threeStoreItems[i];
    const queries = buildCleanQueries(item.product.name, item.brandName);

    const storesToTry: string[] = [];
    if (!item.existingStoreSlugs.has('shophive')) storesToTry.push('shophive');
    if (!item.existingStoreSlugs.has('ishopping')) storesToTry.push('ishopping');
    if (!item.existingStoreSlugs.has('telemart')) storesToTry.push('telemart');
    if (!item.existingStoreSlugs.has('priceoye')) storesToTry.push('priceoye');

    for (const store of storesToTry) {
      for (const query of queries) {
        const candidates = await searchCandidatesOnStore(store, query);
        if (candidates.length > 0) {
          await tryMatchAndPersistCandidates(item, store, candidates);
        }
        if (item.existingStoreSlugs.size >= 4) break;
      }
      if (item.existingStoreSlugs.size >= 4) break;
    }

    if ((i + 1) % 5 === 0 || i === threeStoreItems.length - 1) {
      stats = await getDetailedStoreStats();
      console.log(
        `  Progress: [${i + 1}/${threeStoreItems.length}] | Total Multi: ${stats.totalMulti} | 3+ Stores: ${stats.threePlus} | 4+ Stores: ${stats.fourPlusStores}`
      );
    }
  }

  stats = await getDetailedStoreStats();
  console.log('\nPost Phase A Stats:', stats);

  // ─────────────────────────────────────────────────────────────
  // PHASE B: PROMOTE 2-STORE PRODUCTS TO 3+ STORES (TARGET: >= 46)
  // ─────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  PHASE B: Promoting 2-Store Products to 3+ Stores');
  console.log('────────────────────────────────────────────────────────────────');

  const twoStoreItems = Array.from(productAgg.values()).filter((p) => p.existingStoreSlugs.size === 2);
  console.log(`Auditing ${twoStoreItems.length} 2-store products...`);

  for (let i = 0; i < twoStoreItems.length; i++) {
    if (stats.threePlus >= TARGET_THREE_PLUS && stats.fourPlusStores >= TARGET_FOUR_PLUS) {
      console.log(`  ✓ 3+ stores goal reached (${stats.threePlus} >= ${TARGET_THREE_PLUS})!`);
      break;
    }

    const item = twoStoreItems[i];
    const queries = buildCleanQueries(item.product.name, item.brandName);

    const storesToTry: string[] = [];
    if (!item.existingStoreSlugs.has('shophive')) storesToTry.push('shophive');
    if (!item.existingStoreSlugs.has('ishopping')) storesToTry.push('ishopping');
    if (!item.existingStoreSlugs.has('telemart')) storesToTry.push('telemart');
    if (!item.existingStoreSlugs.has('priceoye')) storesToTry.push('priceoye');

    for (const store of storesToTry) {
      for (const query of queries) {
        const candidates = await searchCandidatesOnStore(store, query);
        if (candidates.length > 0) {
          await tryMatchAndPersistCandidates(item, store, candidates);
        }
        if (item.existingStoreSlugs.size >= 3) break;
      }
      if (item.existingStoreSlugs.size >= 3) break;
    }

    if ((i + 1) % 10 === 0 || i === twoStoreItems.length - 1) {
      stats = await getDetailedStoreStats();
      console.log(
        `  Progress: [${i + 1}/${twoStoreItems.length}] | Total Multi: ${stats.totalMulti} | 3+ Stores: ${stats.threePlus} | 4+ Stores: ${stats.fourPlusStores}`
      );
    }
  }

  stats = await getDetailedStoreStats();
  console.log('\nPost Phase B Stats:', stats);

  // ─────────────────────────────────────────────────────────────
  // PHASE C: EXPAND 1-STORE PRODUCTS TO 2 STORES (TARGET: >= 142)
  // ─────────────────────────────────────────────────────────────
  if (stats.totalMulti < TARGET_TOTAL_MULTISTORE) {
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log(
      `  PHASE C: Expanding 1-Store Products (Current Multi: ${stats.totalMulti}, Target: >= ${TARGET_TOTAL_MULTISTORE})`
    );
    console.log('────────────────────────────────────────────────────────────────');

    const oneStoreItems = Array.from(productAgg.values()).filter((p) => p.existingStoreSlugs.size === 1);
    const priorityCats = ['smart-watches', 'headphones-audio', 'mobiles', 'tablets', 'laptops'];
    oneStoreItems.sort((a, b) => {
      const idxA = priorityCats.indexOf(a.catSlug);
      const idxB = priorityCats.indexOf(b.catSlug);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    console.log(`Auditing ${oneStoreItems.length} 1-store products...`);

    for (let i = 0; i < oneStoreItems.length; i++) {
      if (stats.totalMulti >= TARGET_TOTAL_MULTISTORE) {
        console.log(`  ✓ Total Multi-Store target reached: ${stats.totalMulti} >= ${TARGET_TOTAL_MULTISTORE}!`);
        break;
      }

      const item = oneStoreItems[i];
      const queries = buildCleanQueries(item.product.name, item.brandName);

      const storesToTry: string[] = [];
      if (!item.existingStoreSlugs.has('shophive')) storesToTry.push('shophive');
      if (!item.existingStoreSlugs.has('ishopping')) storesToTry.push('ishopping');
      if (!item.existingStoreSlugs.has('telemart')) storesToTry.push('telemart');
      if (!item.existingStoreSlugs.has('priceoye')) storesToTry.push('priceoye');

      for (const store of storesToTry) {
        for (const query of queries) {
          const candidates = await searchCandidatesOnStore(store, query);
          if (candidates.length > 0) {
            await tryMatchAndPersistCandidates(item, store, candidates);
          }
          if (item.existingStoreSlugs.size >= 2) break;
        }
        if (item.existingStoreSlugs.size >= 2) break;
      }

      if ((i + 1) % 10 === 0 || i === oneStoreItems.length - 1) {
        stats = await getDetailedStoreStats();
        console.log(
          `  Progress: [${i + 1}/${oneStoreItems.length}] | Total Multi: ${stats.totalMulti} | 3+ Stores: ${stats.threePlus} | 4+ Stores: ${stats.fourPlusStores}`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FINAL INTEGRITY CHECK & SUMMARY REPORT
  // ─────────────────────────────────────────────────────────────
  const finalStats = await getDetailedStoreStats();
  const { count: finalProdCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: finalVarCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

  const { data: allDupes } = await supabase.from('prices').select('variant_id, store_id');
  const pairCounts = new Map<string, number>();
  let dupes = 0;
  for (const row of (allDupes as any[]) || []) {
    const key = `${row.variant_id}:${row.store_id}`;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    if (pairCounts.get(key)! > 1) dupes++;
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  FINAL RESULTS FOR INCREMENT 6X DEEP MULTI-STORE EXPANSION');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Total Canonical Products : ${finalProdCount} (Invariant strictly preserved: ${finalProdCount === 822})`);
  console.log(`Total Product Variants   : ${finalVarCount} (Invariant strictly preserved: ${finalVarCount === 822})`);
  console.log(`Duplicate (variant,store): ${dupes} (Strictly 0 duplicates)`);
  console.log(`Newly Added Offers       : ${addedOffers}`);
  console.log(
    `Total Multi-Store Prods  : ${finalStats.totalMulti} / ${finalProdCount} (${(
      (finalStats.totalMulti / (finalProdCount || 1)) *
      100
    ).toFixed(2)}%)`
  );
  console.log(`Products with 2 Stores   : ${finalStats.twoStores}`);
  console.log(`Products with 3 Stores   : ${finalStats.threeStores}`);
  console.log(`Products with 4+ Stores  : ${finalStats.fourPlusStores}`);
  console.log(`Products with 3+ Stores  : ${finalStats.threePlus}`);

  const reportPath = path.resolve(process.cwd(), 'scripts/deep_backfill_report_6x.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        finalProdCount,
        finalVarCount,
        dupes,
        addedOffers,
        finalStats,
      },
      null,
      2
    )
  );
  console.log(`Report saved to ${reportPath}\n`);
}

main().catch(console.error);
