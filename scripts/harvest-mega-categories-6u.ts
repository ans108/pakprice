/**
 * Increment 6U — Mega.pk Category Indexer & Matcher
 *
 * Rules:
 *   - NEVER use /search/ on Mega.pk
 *   - Fetch publicly accessible HTTP 200 category and brand listing pages
 *   - Extract product titles and URLs
 *   - Directly match against catalog with ProductMatcher (allowCreate=false)
 *   - Persist valid new offers for single-store products (expanding multi-store count)
 *   - Validate via PriceValidator
 *   - Strictly enforce: 0 new products/variants, composite uniqueness
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { parseRam, parseStorage } from '@pakprice/shared';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const megaScraper = new MegaPkScraper();
const matcher = new ProductMatcher();
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const MEGA_LISTING_URLS = [
  { url: 'https://www.mega.pk/smartwatches/', category: 'smart-watches' },
  { url: 'https://www.mega.pk/headphones/', category: 'headphones-audio' },
  { url: 'https://www.mega.pk/mobiles/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-apple/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-samsung/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-xiaomi/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-infinix/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-tecno/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-vivo/', category: 'mobiles' },
  { url: 'https://www.mega.pk/mobiles-oppo/', category: 'mobiles' },
  { url: 'https://www.mega.pk/laptop-price-pakistan/', category: 'laptops' },
];

async function getMultiStoreStats(): Promise<{ total: number; multi: number; pct: string }> {
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
  for (const s of prodStores.values()) {
    if (s.size > 1) multi++;
  }
  return {
    total: prodStores.size,
    multi,
    pct: ((multi / (prodStores.size || 1)) * 100).toFixed(2) + '%',
  };
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6U — MEGA.PK CATEGORY HARVEST & BACKFILL');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Baseline check
  const { count: prod0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: var0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const initStats = await getMultiStoreStats();

  console.log(`Baseline Database: ${prod0} products, ${var0} variants`);
  console.log(`Initial Multi-Store Products: ${initStats.multi} / ${initStats.total} (${initStats.pct})\n`);

  // Load store ID for mega-pk
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const megaStore = (stores || []).find(s => s.slug === 'mega-pk' || s.slug === 'mega');
  if (!megaStore) {
    console.error('Mega.pk store row not found in stores table');
    process.exit(1);
  }
  const megaStoreId = megaStore.id;

  // 1. Crawl category listing pages to extract Mega.pk product links
  console.log('────────────────────────────────────────────────────────────────');
  console.log('  CRAWLING MEGA.PK CATEGORY LISTING PAGES');
  console.log('────────────────────────────────────────────────────────────────');

  const megaProducts: Array<{ title: string; url: string; category: string }> = [];
  const seenUrls = new Set<string>();

  for (const listDef of MEGA_LISTING_URLS) {
    try {
      const res = await axios.get(listDef.url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 12000,
      });

      const $ = cheerio.load(res.data);
      let pageFound = 0;

      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html')) {
          const full = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          const title = $(el).text().trim() || $(el).attr('title') || '';
          if (title.length > 3 && !seenUrls.has(full)) {
            seenUrls.add(full);
            megaProducts.push({ title, url: full, category: listDef.category });
            pageFound++;
          }
        }
      });

      console.log(`  ✓ ${listDef.url.padEnd(46)}: ${pageFound} unique products`);
      await sleep(1000);
    } catch (e: any) {
      console.warn(`  ❌ Failed to fetch ${listDef.url}: ${e.message}`);
    }
  }

  console.log(`\nTotal unique Mega.pk candidate URLs discovered: ${megaProducts.length}`);

  // 2. Fetch PDPs, match against catalog, and persist new offers
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  MATCHING & PERSISTING NEW MULTI-STORE OFFERS');
  console.log('────────────────────────────────────────────────────────────────\n');

  let newOffersPersisted = 0;
  let skippedExisting = 0;
  let noMatchCount = 0;

  for (let i = 0; i < megaProducts.length; i++) {
    const item = megaProducts[i];
    const prefix = `[${(i + 1).toString().padStart(3, '0')}/${megaProducts.length}]`;

    // Fetch PDP directly
    let scrapedRaw: any = null;
    try {
      await sleep(1200);
      const pdpRes = await axios.get(item.url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        timeout: 12000,
      });
      scrapedRaw = megaScraper.extractFromHtml(pdpRes.data, item.url);
    } catch {
      continue;
    }

    if (!scrapedRaw || !scrapedRaw.price || scrapedRaw.price <= 0) continue;

    // Build ScrapedProductSchemaType for matcher
    const scraped: ScrapedProductSchemaType = {
      storeSlug: 'mega-pk',
      sourceUrl: item.url,
      sourceIdentifier: scrapedRaw.sourceIdentifier || item.url,
      sourceIdentifierType: scrapedRaw.sourceIdentifierType || 'url_slug',
      name: scrapedRaw.name,
      brand: scrapedRaw.brand || null,
      modelNumber: scrapedRaw.modelNumber || null,
      sku: scrapedRaw.sku || null,
      gtin: null,
      description: null,
      imageUrl: scrapedRaw.imageUrl || null,
      price: scrapedRaw.price,
      originalPrice: scrapedRaw.originalPrice || null,
      discountPercent: null,
      shippingFee: 0,
      inStock: scrapedRaw.inStock !== false,
      stockCount: null,
      ramGb: scrapedRaw.ramGb || parseRam(scrapedRaw.name),
      storageGb: scrapedRaw.storageGb || parseStorage(scrapedRaw.name),
      color: null,
    };

    const matchResult = await matcher.match(scraped, megaStoreId);

    if (matchResult.status !== 'matched' || !matchResult.product || !matchResult.variant) {
      noMatchCount++;
      continue;
    }

    const matchedProduct = matchResult.product;
    const matchedVariant = matchResult.variant;

    // 1. Size Conflict Guard (e.g. 44mm vs 40mm, 45mm vs 41mm)
    const canonicalSize = (matchedProduct.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
    const candidateSize = (scraped.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
    if (canonicalSize && candidateSize && canonicalSize !== candidateSize) {
      console.warn(`${prefix} ⚠️ Size conflict: candidate ${candidateSize}mm vs canonical ${canonicalSize}mm ("${scraped.name}" vs "${matchedProduct.name}")`);
      continue;
    }

    // 2. Strict RAM / Storage compatibility
    if (scraped.ramGb && matchedVariant.ram_gb && scraped.ramGb !== matchedVariant.ram_gb) {
      console.warn(`${prefix} ⚠️ RAM mismatch: ${scraped.ramGb}GB vs ${matchedVariant.ram_gb}GB`);
      continue;
    }
    if (scraped.storageGb && matchedVariant.storage_gb && scraped.storageGb !== matchedVariant.storage_gb) {
      console.warn(`${prefix} ⚠️ Storage mismatch: ${scraped.storageGb}GB vs ${matchedVariant.storage_gb}GB`);
      continue;
    }

    // Check if (variant_id, megaStoreId) already exists in prices
    const { data: existingPrice } = await supabase
      .from('prices')
      .select('id')
      .eq('variant_id', matchedVariant.id)
      .eq('store_id', megaStoreId)
      .maybeSingle();

    if (existingPrice) {
      skippedExisting++;
      continue;
    }

    // Validate price
    const priceVal = validatePrice({
      price: scraped.price,
      originalPrice: scraped.originalPrice || null,
      discountPercent: null,
      shippingFee: 0,
      inStock: scraped.inStock,
      stockCount: null,
      previousPrice: null,
      previousOriginalPrice: null,
    });

    if (priceVal.action === 'rejected') {
      console.warn(`${prefix} ❌ Price rejected for "${scraped.name}": ${priceVal.rejectReason}`);
      continue;
    }

    // Persist new offer
    const nowIso = new Date().toISOString();
    const { error: insErr } = await supabase.from('prices').insert({
      variant_id: matchedVariant.id,
      store_id: megaStoreId,
      price: priceVal.price,
      original_price: priceVal.originalPrice,
      shipping_fee: 0,
      in_stock: scraped.inStock,
      product_url: item.url,
      last_scraped_at: nowIso,
      updated_at: nowIso,
    });

    if (insErr) {
      console.error(`${prefix} DB insert error: ${insErr.message}`);
      continue;
    }

    // Insert price history
    await supabase.from('price_history').insert({
      variant_id: matchedVariant.id,
      store_id: megaStoreId,
      price: priceVal.price,
      original_price: priceVal.originalPrice,
      shipping_fee: 0,
      in_stock: scraped.inStock,
      scraped_at: nowIso,
    });

    // Upsert identifier
    await supabase.from('store_product_identifiers').upsert({
      variant_id: matchedVariant.id,
      store_id: megaStoreId,
      identifier_type: 'url_slug',
      identifier: item.url,
      last_seen_at: nowIso,
    }, { onConflict: 'store_id,identifier_type,identifier' });

    newOffersPersisted++;
    const currentStats = await getMultiStoreStats();

    console.log(`${prefix} 🎉 [NEW OFFER #${newOffersPersisted}] "${scraped.name}" → "${matchedProduct.name}"`);
    console.log(`      Store: mega-pk | Price: Rs. ${priceVal.price.toLocaleString()} | Strategy: ${matchResult.method} | Multi-Store Total: ${currentStats.multi} (${currentStats.pct})`);
  }

  // Summary
  const finalStats = await getMultiStoreStats();
  const { count: prodFinal } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varFinal } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  MEGA.PK HARVEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Discovered Mega.pk Candidates : ${megaProducts.length}`);
  console.log(`  New Offers Persisted          : ${newOffersPersisted}`);
  console.log(`  Skipped (Already in DB)       : ${skippedExisting}`);
  console.log(`  No Match Found                : ${noMatchCount}`);
  console.log(`  Multi-Store Baseline          : ${initStats.multi} (${initStats.pct})`);
  console.log(`  Multi-Store Final             : ${finalStats.multi} (${finalStats.pct})`);
  console.log(`  Canonical Products (822)      : ${prodFinal} ${prodFinal === 822 ? '✓' : '❌'}`);
  console.log(`  Product Variants (822)        : ${varFinal} ${varFinal === 822 ? '✓' : '❌'}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error in harvest-mega-categories-6u:', err);
  process.exit(1);
});
