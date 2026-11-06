import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import {
  normalizeProductName,
  calculateStringSimilarity,
  extractRamFromTitle,
  extractStorageFromTitle,
} from '@pakprice/shared';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== MULTI-EVIDENCE BRAND CANDIDATE DISCOVERY ===\n');

  // Load reference catalog from DB
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: dbProducts } = await supabase.from('products').select(`
    id, name, normalized_name,
    categories ( slug ),
    product_variants (
      id, model_number, ram_gb, storage_gb,
      prices ( store_id, price )
    )
  `);

  const catalog: any[] = [];
  for (const p of dbProducts || []) {
    const storeSet = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        const sl = storeMap.get(pr.store_id);
        if (sl) storeSet.add(sl);
      }
    }
    catalog.push({
      id: p.id,
      name: p.name,
      normalized: p.normalized_name || normalizeProductName(p.name),
      category: (p.categories as any)?.slug || null,
      stores: Array.from(storeSet),
      variants: (p.product_variants || []).map(v => ({
        id: v.id,
        modelNumber: v.model_number || null,
        ram: v.ram_gb || null,
        storage: v.storage_gb || null,
      })),
    });
  }

  console.log(`Loaded ${catalog.length} DB products as reference.\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const brandUrls = [
    'https://www.mega.pk/apple_laptops-price-pakistan/',
    'https://www.mega.pk/lenovo_laptops-price-pakistan/',
    'https://www.mega.pk/hp_laptops-price-pakistan/',
    'https://www.mega.pk/dell_laptops-price-pakistan/',
    'https://www.mega.pk/samsung_mobiles-price-pakistan/',
    'https://www.mega.pk/xiaomi_mobiles-price-pakistan/',
    'https://www.mega.pk/smartwatches-price-pakistan/',
  ];

  const candidatePool: any[] = [];
  const discoveredUrls = new Set<string>();

  for (const bUrl of brandUrls) {
    console.log(`Searching: ${bUrl}`);
    try {
      await page.goto(bUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const html = await page.content();
      const $ = cheerio.load(html);

      const pageProducts: { text: string; href: string }[] = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('_products/') || href.includes('-price-pakistan.html')) && !href.includes('/category/')) {
          const fullHref = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          const t = $(el).text().trim() || $(el).attr('title') || '';
          if (t && t.length > 5 && !t.includes('Price in Pakistan') && !discoveredUrls.has(fullHref)) {
            discoveredUrls.add(fullHref);
            pageProducts.push({ text: t, href: fullHref });
          }
        }
      });

      console.log(`  Found ${pageProducts.length} unique products on this page.`);

      for (const p of pageProducts) {
        const norm = normalizeProductName(p.text);
        const pRam = extractRamFromTitle(p.text);
        const pStorage = extractStorageFromTitle(p.text);

        for (const ref of catalog) {
          // Check protected family conflicts
          const pLower = norm.toLowerCase();
          const rLower = ref.normalized.toLowerCase();
          if (
            (pLower.includes('pro max') && !rLower.includes('pro max') && rLower.includes('pro')) ||
            (!pLower.includes('pro max') && pLower.includes('pro') && rLower.includes('pro max'))
          ) {
            continue;
          }

          const sim = calculateStringSimilarity(norm, ref.normalized);
          if (sim >= 0.80) {
            // Check specs
            let conflict = false;
            if (pRam !== null || pStorage !== null) {
              for (const v of ref.variants) {
                if (pRam !== null && v.ram !== null && pRam !== v.ram) conflict = true;
                if (pStorage !== null && v.storage !== null && pStorage !== v.storage) conflict = true;
              }
            }

            if (!conflict) {
              candidatePool.push({
                megaTitle: p.text,
                megaUrl: p.href,
                megaNorm: norm,
                megaRam: pRam,
                megaStorage: pStorage,
                existingProduct: ref.name,
                existingStores: ref.stores,
                category: ref.category,
                similarity: sim,
              });
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`  Failed ${bUrl}:`, e.message);
    }
  }

  await browser.close();

  // Deduplicate candidatePool by megaUrl
  const uniqueCandidates = new Map<string, any>();
  for (const c of candidatePool) {
    const existing = uniqueCandidates.get(c.megaUrl);
    if (!existing || c.similarity > existing.similarity) {
      uniqueCandidates.set(c.megaUrl, c);
    }
  }

  const sortedCandidates = Array.from(uniqueCandidates.values()).sort((a, b) => b.similarity - a.similarity);

  console.log(`\n=== CANDIDATE POOL SUMMARY (${sortedCandidates.length} high-similarity candidates) ===`);
  for (const c of sortedCandidates.slice(0, 25)) {
    console.log(`- Mega: "${c.megaTitle}"`);
    console.log(`  Existing: "${c.existingProduct}" (stores: ${c.existingStores.join(', ')})`);
    console.log(`  Similarity: ${c.similarity.toFixed(3)} | URL: ${c.megaUrl}\n`);
  }

  fs.writeFileSync('scratch/mega-brand-candidates.json', JSON.stringify(sortedCandidates, null, 2), 'utf8');
  console.log('Saved scratch/mega-brand-candidates.json');
}

main().catch(console.error);
