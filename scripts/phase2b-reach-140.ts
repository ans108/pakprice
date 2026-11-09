import dotenv from 'dotenv';
import path from 'path';
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

async function searchCandidatesOnStore(storeSlug: string, query: string): Promise<Array<{ title: string; url: string; price: number }>> {
  const results: Array<{ title: string; url: string; price: number }> = [];
  try {
    if (storeSlug === 'shophive') {
      await sleep(1000);
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
    } else if (storeSlug === 'ishopping') {
      await sleep(1000);
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
          const title = a.attr('title') || $(el).find('.product-item-name, h2, h3').text().trim() || a.text().trim();
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
  } catch {}
  return results;
}

async function getStats() {
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

  let one = 0, two = 0, three = 0, fourPlus = 0;
  for (const s of prodMap.values()) {
    if (s.size === 1) one++;
    else if (s.size === 2) two++;
    else if (s.size === 3) three++;
    else if (s.size >= 4) fourPlus++;
  }

  return {
    totalMulti: two + three + fourPlus,
    two,
    three,
    fourPlus,
    threePlus: three + fourPlus,
  };
}

async function main() {
  let stats = await getStats();
  console.log('Current Multi-Store Stats:', stats);
  if (stats.totalMulti >= 140) {
    console.log('Target >= 140 already reached!');
    return;
  }

  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map((s) => [s.slug, s.id]));

  const { data: allVariants } = await supabase
    .from('product_variants')
    .select('id, product_id, ram_gb, storage_gb, color, model_number, products!inner(id, name, slug)');

  const productAgg = new Map<string, any>();
  for (const v of allVariants || []) {
    productAgg.set(v.product_id, {
      product: (v as any).products,
      variant: v,
      existingStoreSlugs: new Set(),
      existingStoreIds: new Set(),
    });
  }

  const { data: allPrices } = await supabase.from('prices').select('variant_id, store_id, product_variants!inner(product_id)');
  for (const p of allPrices || []) {
    const prodId = (p as any).product_variants?.product_id;
    if (prodId && productAgg.has(prodId)) {
      productAgg.get(prodId)!.existingStoreIds.add(p.store_id);
      const slug = (stores || []).find((s) => s.id === p.store_id)?.slug;
      if (slug) productAgg.get(prodId)!.existingStoreSlugs.add(slug);
    }
  }

  const queries = [
    'Samsung',
    'Xiaomi',
    'Redmi',
    'Infinix',
    'Tecno',
    'Apple',
    'Audionic',
    'Ronin',
    'Faster',
    'Dany',
    'Realme',
    'Vivo',
    'Honor',
    'Oppo',
    'Anker',
    'Joyroom',
    'Lenovo',
    'Dell',
    'HP',
  ];

  for (const q of queries) {
    if (stats.totalMulti >= 140) {
      console.log(`✓ Reached target >= 140: ${stats.totalMulti}`);
      break;
    }

    console.log(`Searching query: "${q}"...`);
    for (const storeSlug of ['shophive', 'ishopping']) {
      const storeId = storeMap.get(storeSlug);
      if (!storeId) continue;

      const candidates = await searchCandidatesOnStore(storeSlug, q);
      for (const cand of candidates) {
        const scraped: ScrapedProductSchemaType = {
          storeSlug,
          sourceUrl: cand.url,
          sourceIdentifier: cand.url.split('/').pop()?.split('?')[0] || `${storeSlug}-sku`,
          sourceIdentifierType: 'url_slug',
          name: cand.title,
          brand: null,
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
          ramGb: extractRamFromTitle(cand.title),
          storageGb: extractStorageFromTitle(cand.title),
          color: null,
        };

        try {
          const matchResult = await matcher.match(scraped, storeId);
          if (matchResult.status === 'matched' && matchResult.variant) {
            const targetVariantId = matchResult.variant.id;
            const matchedItem = Array.from(productAgg.values()).find((it) => it.variant.id === targetVariantId);

            if (matchedItem && !matchedItem.existingStoreSlugs.has(storeSlug)) {
              const currentPriceRow = await priceRepo.getCurrentPrice(targetVariantId, storeId);
              const validation = validatePrice({
                price: scraped.price,
                originalPrice: null,
                discountPercent: null,
                shippingFee: null,
                inStock: true,
                stockCount: null,
                previousPrice: currentPriceRow?.price || null,
                previousOriginalPrice: currentPriceRow?.original_price || null,
              });

              if (validation.action !== 'rejected') {
                await priceRepo.upsertCurrentPrice({
                  variant_id: targetVariantId,
                  store_id: storeId,
                  price: validation.price,
                  original_price: validation.originalPrice,
                  shipping_fee: 0,
                  in_stock: true,
                  product_url: cand.url,
                });

                if (!currentPriceRow || Math.abs(currentPriceRow.price - validation.price) > 0.01) {
                  await priceRepo.insertPriceHistory(targetVariantId, storeId, validation.price, validation.originalPrice, 0, true);
                }

                matchedItem.existingStoreSlugs.add(storeSlug);
                matchedItem.existingStoreIds.add(storeId);
                console.log(`  ✅ Added ${matchedItem.product.name} on ${storeSlug.toUpperCase()} @ Rs. ${cand.price.toLocaleString()}`);
              }
            }
          }
        } catch {}
      }
    }

    stats = await getStats();
    console.log(`  Current Multi: ${stats.totalMulti} / 822 (${((stats.totalMulti / 822) * 100).toFixed(2)}%)`);
  }

  const finalStats = await getStats();
  console.log('\nFinal Stats After 2B:', finalStats);
}

main().catch(console.error);

