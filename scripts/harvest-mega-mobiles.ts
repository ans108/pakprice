import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function harvestMobiles() {
  console.log('=== HARVESTING & MATCHING MEGA.PK MOBILES (PAGES 1-3) ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk store not found');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const pages = [
    'https://www.mega.pk/mobiles/',
    'https://www.mega.pk/mobiles/2/',
    'https://www.mega.pk/mobiles/3/',
  ];

  const mobileUrls: string[] = [];
  for (const pUrl of pages) {
    console.log(`Fetching ${pUrl}...`);
    try {
      await page.goto(pUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      const $ = cheerio.load(html);
      $('a[href*="_products/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !mobileUrls.includes(href)) mobileUrls.push(href);
      });
    } catch (e: any) {
      console.error(pUrl, e.message);
    }
  }

  console.log(`Discovered ${mobileUrls.length} total mobile URLs on Mega.pk.`);

  const scraper = new MegaPkScraper();
  const matcher = new ProductMatcher();

  const exactMatches: any[] = [];

  // Bounded check of first 40 URLs
  const limit = Math.min(mobileUrls.length, 40);
  for (let i = 0; i < limit; i++) {
    const url = mobileUrls[i];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(600);
      const html = await page.content();
      const extracted = scraper.extractFromHtml(html, url);
      if (!extracted) continue;
      const valid = scraper.validateProduct(extracted);
      if (!valid) continue;

      const res = await matcher.match(valid, store.id);
      if (res.status === 'matched' && res.method === 'exact_specs') {
        exactMatches.push({
          url,
          name: valid.name,
          price: valid.price,
          method: res.method,
          product: res.product?.name,
          variantId: res.variant?.id,
        });
        console.log(`🎉 [EXACT_SPECS MATCH]`);
        console.log(`   Mega: "${valid.name}" (PKR ${valid.price})`);
        console.log(`   DB:   "${res.product?.name}" (Variant: ${res.variant?.id})`);
        console.log(`   URL:  ${url}\n`);
      }
    } catch (e: any) {
      // skip
    }
  }

  await browser.close();

  console.log(`Total exact_specs mobile matches found: ${exactMatches.length}`);
  fs.writeFileSync('scratch/mega-mobiles-exact-matches.json', JSON.stringify(exactMatches, null, 2), 'utf8');
}

harvestMobiles().catch(console.error);
