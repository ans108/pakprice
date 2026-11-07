import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { FirecrawlValidator, FirecrawlCandidateJson } from './firecrawl-validator';
import { PriceRepository } from '../apps/scraper/src/repositories/PriceRepository';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';

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

async function main() {
  const validator = new FirecrawlValidator();
  await validator.init();

  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.slug, s.id]));

  // Get single store products
  const { data: products } = await supabase
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

  const targets = (products || []).filter(p => {
    const storeIds = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        storeIds.add(pr.store_id);
      }
    }
    return storeIds.size === 1;
  });

  console.log(`Auditing ${targets.length} single store candidates...`);

  // Target specific well-known models: Audionic, Ronin, Dany, Faster, Infinix, Tecno
  const prioritized = targets.filter(p => {
    const n = p.name.toLowerCase();
    return n.includes('audionic') || n.includes('ronin') || n.includes('dany') || n.includes('faster') || n.includes('infinix') || n.includes('spark');
  });

  console.log(`Prioritized ${prioritized.length} audio/mobile candidates`);

  let added = 0;

  for (const target of prioritized) {
    if (added >= 3) break;

    const existingStoreId = target.product_variants[0]?.prices[0]?.store_id;
    const existingStoreSlug = Array.from(storeMap.entries()).find(([_, id]) => id === existingStoreId)?.[0];
    const candidateStores = ['priceoye', 'telemart', 'shophive'].filter(s => s !== existingStoreSlug);

    const cleanQuery = target.name
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\b(Dual Sim|With Official Warranty|Official Warranty|Pin Pack|PTA Approved)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    for (const storeSlug of candidateStores) {
      const storeId = storeMap.get(storeSlug);
      if (!storeId) continue;

      let candidateUrls: Array<{ title: string; url: string }> = [];

      try {
        if (storeSlug === 'priceoye') {
          const res = await axios.get(`https://priceoye.pk/search?q=${encodeURIComponent(cleanQuery)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a[href*="/wireless-earbuds/"], a[href*="/mobiles/"], a[href*="/smart-watches/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('/pricelist/')) {
              const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
              const segs = fullUrl.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
              if (segs.length >= 3) {
                candidateUrls.push({ title: $(el).text().trim(), url: fullUrl });
              }
            }
          });
        } else if (storeSlug === 'telemart') {
          const res = await axios.get(`https://www.telemart.pk/search?q=${encodeURIComponent(cleanQuery)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a[href*="/products/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.telemart.pk${href.startsWith('/') ? '' : '/'}${href}`;
              candidateUrls.push({ title: $(el).text().trim(), url: fullUrl });
            }
          });
        } else if (storeSlug === 'shophive') {
          const res = await axios.get(`https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(cleanQuery)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
          });
          const $ = cheerio.load(res.data);
          $('a.product-item-link').each((_, el) => {
            const href = $(el).attr('href');
            if (href) candidateUrls.push({ title: $(el).text().trim(), url: href });
          });
        }

        for (const cand of candidateUrls.slice(0, 2)) {
          let scraped: any = null;
          const pdpRes = await axios.get(cand.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
          if (storeSlug === 'priceoye') scraped = priceoyeScraper.extractProductFromHtml(pdpRes.data, cand.url);
          else if (storeSlug === 'telemart') scraped = telemartScraper.extractFromHtml(pdpRes.data, cand.url);
          else if (storeSlug === 'shophive') scraped = shophiveScraper.extractProductFromHtml(pdpRes.data, cand.url, 'wireless-earbuds');

          if (!scraped || !scraped.price || scraped.price <= 0) continue;

          const candidateJson: FirecrawlCandidateJson = {
            store_name: storeSlug,
            store_slug: storeSlug,
            source_product_title: scraped.name,
            source_product_url: cand.url,
            brand: scraped.brand || null,
            model: scraped.modelNumber || null,
            model_number: scraped.modelNumber || null,
            category: (target.categories as any)?.slug || null,
            ram: scraped.ramGb ? `${scraped.ramGb}GB` : null,
            storage: scraped.storageGb ? `${scraped.storageGb}GB` : null,
            physical_size: null,
            color: scraped.color || null,
            price: scraped.price,
            original_price: scraped.originalPrice || null,
            currency: 'PKR',
            stock_status: scraped.inStock ? 'in_stock' : 'out_of_stock',
            sku: scraped.sku || null,
            image_url: scraped.imageUrl || null,
            description: null,
            discovery_method: 'direct_connector',
            extraction_timestamp: new Date().toISOString(),
          };

          const val = await validator.validateCandidate(target, candidateJson);
          if (val.status === 'approved' && val.matchedVariantId && val.confidence && val.confidence >= 0.85) {
            console.log(`\n🎉 VERIFIED EXACT MATCH:`);
            console.log(`   Canonical: ${target.name}`);
            console.log(`   Discovered: ${scraped.name} (${storeSlug})`);
            console.log(`   Price: Rs. ${scraped.price} | Confidence: ${val.confidence} | Strategy: ${val.strategy}`);

            // Persist
            await priceRepo.upsertCurrentPrice({
              variant_id: val.matchedVariantId,
              store_id: storeId,
              price: scraped.price,
              original_price: scraped.originalPrice || null,
              discount_percent: scraped.originalPrice && scraped.originalPrice > scraped.price ? Math.round(((scraped.originalPrice - scraped.price) / scraped.originalPrice) * 100) : null,
              shipping_fee: 0,
              min_order_free_shipping: null,
              coupon_discount: 0,
              bank_discount: 0,
              in_stock: scraped.inStock,
              product_url: cand.url,
            } as any);

            await priceRepo.insertPriceHistory(val.matchedVariantId, storeId, scraped.price, scraped.originalPrice || null, 0, scraped.inStock);

            console.log(`   ✓ Persisted to database!`);
            added++;
            break;
          }
        }
      } catch (err: any) {
        // Continue politely
      }
    }
  }

  console.log(`\nAdded ${added} verified cross-store offers.`);
}

main().catch(console.error);

