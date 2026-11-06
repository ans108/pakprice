import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeProductName, calculateStringSimilarity } from '@pakprice/shared';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function matchWatches() {
  console.log('=== MATCHING MEGA.PK WATCHES AGAINST CATALOG ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk not found');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.mega.pk/watches/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const html = await page.content();
  const $ = cheerio.load(html);

  const watchUrls: string[] = [];
  $('a[href*="_products/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !watchUrls.includes(href)) watchUrls.push(href);
  });

  console.log(`Found ${watchUrls.length} watch URLs on Mega.pk.`);

  const scraper = new MegaPkScraper();
  const matcher = new ProductMatcher();

  const matchedWatches: any[] = [];

  for (const url of watchUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      const pHtml = await page.content();
      const extracted = scraper.extractFromHtml(pHtml, url);
      if (!extracted) continue;
      const valid = scraper.validateProduct(extracted);
      if (!valid) continue;

      const res = await matcher.match(valid, store.id);
      if (res.status === 'matched') {
        matchedWatches.push({
          url,
          name: valid.name,
          price: valid.price,
          method: res.method,
          product: res.product?.name,
          variantId: res.variant?.id,
        });
        console.log(`🎉 [MATCHED] "${valid.name}" -> "${res.product?.name}" (${res.method}, variant: ${res.variant?.id})`);
      } else if (res.status === 'ambiguous') {
        console.log(`⚠️  [AMBIGUOUS] "${valid.name}" -> ${res.reason}`);
      } else {
        console.log(`ℹ️  [NO_MATCH] "${valid.name}"`);
      }
    } catch (e: any) {
      console.warn(`Error on ${url}:`, e.message);
    }
  }

  await browser.close();

  console.log(`\nMatched watches: ${matchedWatches.length}`);
}

matchWatches().catch(console.error);
