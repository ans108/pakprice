import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function matchDaraz() {
  console.log('=== MATCHING DARAZ PRODUCTS AGAINST CATALOG ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'daraz').single();
  if (!store) throw new Error('Daraz store not found');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const categories = [
    'https://www.daraz.pk/smartphones/',
    'https://www.daraz.pk/smart-watches/',
  ];

  const discoveredLinks: string[] = [];
  for (const cUrl of categories) {
    try {
      await page.goto(cUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2000);
      const html = await page.content();
      const $ = cheerio.load(html);
      $('a[href*="/products/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          const full = href.startsWith('//') ? `https:${href}` : href.startsWith('http') ? href : `https://www.daraz.pk${href}`;
          const clean = full.split('?')[0];
          if (!discoveredLinks.includes(clean)) discoveredLinks.push(clean);
        }
      });
    } catch (e: any) {
      console.warn(`Error on ${cUrl}:`, e.message);
    }
  }

  console.log(`Discovered ${discoveredLinks.length} Daraz product links.`);

  const scraper = new DarazScraper();
  const matcher = new ProductMatcher();

  const darazMatches: any[] = [];

  // Check top 20 links
  const toCheck = discoveredLinks.slice(0, 20);
  for (let i = 0; i < toCheck.length; i++) {
    const link = toCheck[i];
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1000);
      const html = await page.content();
      const extracted = scraper.extractFromHtml(html, link);
      if (!extracted) continue;
      const valid = scraper.validateProduct(extracted);
      if (!valid) continue;

      const res = await matcher.match(valid, store.id);
      if (res.status === 'matched') {
        darazMatches.push({
          url: link,
          name: valid.name,
          price: valid.price,
          method: res.method,
          confidence: res.confidence,
          product: res.product?.name,
          variantId: res.variant?.id,
        });
        console.log(`🎉 [DARAZ MATCH] "${valid.name}" -> "${res.product?.name}" (${res.method}, variant: ${res.variant?.id})`);
      } else if (res.status === 'ambiguous') {
        console.log(`⚠️  [AMBIGUOUS] "${valid.name}" -> ${res.reason}`);
      } else {
        console.log(`ℹ️  [NO_MATCH] "${valid.name}"`);
      }
    } catch (e: any) {
      console.warn(`Error on ${link}:`, e.message);
    }
  }

  await browser.close();
  console.log(`\nDaraz matches found: ${darazMatches.length}`);
  fs.writeFileSync('scratch/daraz-matches.json', JSON.stringify(darazMatches, null, 2), 'utf8');
}

matchDaraz().catch(console.error);
