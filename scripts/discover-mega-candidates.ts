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
  areModelsConflicting,
} from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface MegaCandidate {
  megaUrl: string;
  megaTitle: string;
  megaNormalized: string;
  megaRam: number | null;
  megaStorage: number | null;
  existingProduct: {
    id: string;
    name: string;
    normalized: string;
    category: string | null;
    stores: string[];
    variants: {
      id: string;
      modelNumber: string | null;
      ram: number | null;
      storage: number | null;
    }[];
  };
  evidenceType: string;
  similarity: number;
}

async function discoverCandidates() {
  console.log('=== INCREMENT 6E: CANDIDATE-DRIVEN DISCOVERY FOR MEGA.PK ===\n');

  // 1. Bulk-load existing catalog from DB
  console.log('1. Loading existing PriceOye and Telemart catalog...');
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: dbProducts } = await supabase.from('products').select(`
    id, name, normalized_name,
    categories ( slug ),
    product_variants (
      id, model_number, ram_gb, storage_gb,
      prices ( store_id )
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
    // Only items present in PriceOye or Telemart
    if (storeSet.has('priceoye') || storeSet.has('telemart')) {
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
  }
  console.log(`Loaded ${catalog.length} candidate reference products from DB.\n`);

  // 2. Discover URLs from Mega.pk category pages
  console.log('2. Discovering product links from Mega.pk categories...');
  const targetCategories = [
    { cat: 'mobiles', url: 'https://www.mega.pk/mobiles/' },
    { cat: 'laptops', url: 'https://www.mega.pk/laptop-price-pakistan/' },
    { cat: 'tablets', url: 'https://www.mega.pk/tablets/' },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const discoveredMegaProducts: { url: string; title: string; category: string }[] = [];
  const seenUrls = new Set<string>();

  for (const tc of targetCategories) {
    console.log(`Navigating to ${tc.url}...`);
    try {
      await page.goto(tc.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2000);
      const html = await page.content();
      const $ = cheerio.load(html);

      // Mega.pk product links typically contain `_products/` or `-price-pakistan.html`
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (
          href &&
          (href.includes('_products/') || href.includes('-price-pakistan.html')) &&
          !href.includes('/category/') &&
          !href.includes('/brand/')
        ) {
          const fullUrl = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            // Some links have the product title directly in text or in an inner h3/div
            const title = text || $(el).attr('title') || '';
            discoveredMegaProducts.push({ url: fullUrl, title, category: tc.cat });
          }
        }
      });
    } catch (err: any) {
      console.warn(`Warning navigating ${tc.url}:`, err.message);
    }
  }

  console.log(`Discovered ${discoveredMegaProducts.length} unique product URLs from Mega.pk.\n`);

  // If link texts were empty, scrape the page titles of the top 30 links
  console.log('3. Inspecting product titles for candidate matching...');
  const detailedMegaProducts: { url: string; title: string; category: string }[] = [];

  // Let's inspect up to 35 products to find strong candidates
  const sampleLimit = Math.min(discoveredMegaProducts.length, 35);
  for (let i = 0; i < sampleLimit; i++) {
    const item = discoveredMegaProducts[i];
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1000);
      const html = await page.content();
      const $ = cheerio.load(html);

      let title = $('h1').first().text().trim() || $('#header_product_title').first().text().trim();
      if (title.includes('Price in Pakistan')) {
        title = title.split('Price in Pakistan')[0].trim();
      }
      if (title) {
        detailedMegaProducts.push({ url: item.url, title, category: item.category });
        console.log(`  [${i + 1}/${sampleLimit}] Found Mega.pk: "${title}"`);
      }
    } catch (e: any) {
      console.warn(`  Failed fetching ${item.url}:`, e.message);
    }
  }

  await browser.close();

  // 4. Candidate matching against DB catalog using multi-evidence priority
  console.log(`\n4. Matching ${detailedMegaProducts.length} Mega.pk products against existing catalog...`);
  const candidates: MegaCandidate[] = [];

  for (const mega of detailedMegaProducts) {
    const megaNorm = normalizeProductName(mega.title);
    const megaRam = extractRamFromTitle(mega.title);
    const megaStorage = extractStorageFromTitle(mega.title);

    let bestMatch: any = null;
    let bestSim = 0;
    let evidence = '';

    for (const ref of catalog) {
      // Check for protected product family conflicts like "Pro" vs "Pro Max"
      const megaLower = megaNorm.toLowerCase();
      const refLower = ref.normalized.toLowerCase();
      const isMegaProMax = megaLower.includes('pro max');
      const isRefProMax = refLower.includes('pro max');
      const isMegaProOnly = megaLower.includes('pro') && !isMegaProMax;
      const isRefProOnly = refLower.includes('pro') && !isRefProMax;

      if ((isMegaProMax && isRefProOnly) || (isMegaProOnly && isRefProMax)) {
        continue; // Protected Pro vs Pro Max conflict
      }

      // Check RAM / Storage conflicts against variants
      const sim = calculateStringSimilarity(megaNorm, ref.normalized);
      if (sim > bestSim && sim >= 0.70) {
        // Check if any variant conflicts
        let hasConflict = false;
        if (megaRam !== null || megaStorage !== null) {
          for (const v of ref.variants) {
            if (megaRam !== null && v.ram !== null && megaRam !== v.ram) hasConflict = true;
            if (megaStorage !== null && v.storage !== null && megaStorage !== v.storage) hasConflict = true;
          }
        }

        if (!hasConflict) {
          bestSim = sim;
          bestMatch = ref;
          if (sim >= 0.95) evidence = 'near_exact_name';
          else if (sim >= 0.85) evidence = 'strong_name_and_specs';
          else evidence = 'moderate_name_similarity';
        }
      }
    }

    if (bestMatch && bestSim >= 0.75) {
      candidates.push({
        megaUrl: mega.url,
        megaTitle: mega.title,
        megaNormalized: megaNorm,
        megaRam,
        megaStorage,
        existingProduct: bestMatch,
        evidenceType: evidence,
        similarity: bestSim,
      });
    }
  }

  // Sort by similarity descending
  candidates.sort((a, b) => b.similarity - a.similarity);

  console.log(`\n=== CANDIDATE RESULTS (${candidates.length} candidate pairs discovered) ===`);
  for (const c of candidates) {
    console.log(`\nCandidate:`);
    console.log(`  Mega.pk:  "${c.megaTitle}" (${c.megaUrl})`);
    console.log(`  Existing: "${c.existingProduct.name}" (stores: ${c.existingProduct.stores.join(', ')})`);
    console.log(`  Sim:      ${c.similarity.toFixed(3)} | Evidence: ${c.evidenceType}`);
  }

  // Save to scratch/mega-discovered-candidates.json for Stage A/B ingestion
  const fs = require('fs');
  fs.writeFileSync('scratch/mega-discovered-candidates.json', JSON.stringify(candidates, null, 2), 'utf8');
  console.log('\nWrote scratch/mega-discovered-candidates.json');
}

discoverCandidates().catch(console.error);
