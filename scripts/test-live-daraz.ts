import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('\n=============================================================');
  console.log('  DARAZ LIVE ACCESS & INGESTION PIPELINE AUDIT');
  console.log('=============================================================\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'daraz').single();
  if (!store) throw new Error('Daraz store not found in DB');

  const darazScraper = new DarazScraper();
  const ingestionService = new PriceIngestionService();

  console.log('Testing live browser access to Daraz...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const targetUrl = 'https://www.daraz.pk/smartphones/';
  console.log(`Navigating to ${targetUrl}...`);

  let blocked = false;
  let blockEvidence = '';
  let discoveredLinks: string[] = [];

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    const status = response?.status();
    console.log(`HTTP Status: ${status}`);

    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    const title = await page.title();
    const bodyText = await page.innerText('body');

    console.log(`Current URL: ${currentUrl}`);
    console.log(`Page Title: ${title}`);

    // Check anti-bot indicators
    if (
      currentUrl.includes('punish') ||
      currentUrl.includes('sec.daraz.pk') ||
      currentUrl.includes('captcha') ||
      bodyText.includes('slide to verify') ||
      bodyText.includes('robot') ||
      bodyText.includes('punish page') ||
      status === 403 ||
      status === 429
    ) {
      blocked = true;
      blockEvidence = `Anti-bot trigger: URL=${currentUrl}, Title=${title}, Status=${status}`;
      console.warn(`⚠️ Anti-bot detected: ${blockEvidence}`);
    } else {
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
      console.log(`Discovered ${discoveredLinks.length} product links.`);
    }
  } catch (err: any) {
    blocked = true;
    blockEvidence = `Navigation error: ${err.message}`;
    console.warn(`⚠️ Error accessing Daraz: ${blockEvidence}`);
  }

  let persisted = false;
  let persistedProduct = null;

  if (discoveredLinks.length > 0) {
    const testLink = discoveredLinks[0];
    console.log(`\nTesting extraction on real product link: ${testLink}`);
    try {
      await page.goto(testLink, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2000);
      const prodHtml = await page.content();
      const extracted = darazScraper.extractFromHtml(prodHtml, testLink);
      if (extracted) {
        const valid = darazScraper.validateProduct(extracted);
        if (valid) {
          console.log(`Extracted valid product: ${valid.name} | Price: PKR ${valid.price}`);
          const res = await ingestionService.ingest(valid, store.id, false);
          console.log(`Ingestion action: ${res.action}, variantId: ${res.variantId}`);
          persisted = (res.action === 'created' || res.action === 'updated');
          persistedProduct = valid;
        }
      }
    } catch (e: any) {
      console.error('Failed to extract product page:', e.message);
    }
  }

  await browser.close();

  console.log('\n=============================================================');
  console.log('  DARAZ AUDIT RESULTS');
  console.log('=============================================================');
  console.log(`Live Blocked: ${blocked}`);
  console.log(`Block Evidence: ${blockEvidence || 'None (Accessible)'}`);
  console.log(`Product Links Discovered: ${discoveredLinks.length}`);
  console.log(`Product Persisted: ${persisted}`);
}

main().catch(err => {
  console.error('Fatal Daraz audit error:', err);
  process.exit(1);
});
