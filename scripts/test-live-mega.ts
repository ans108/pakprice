import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('\n=============================================================');
  console.log('  MEGA.PK CONTROLLED LIVE CRAWL & INGESTION AUDIT');
  console.log('=============================================================\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk store not found in DB');

  const megaScraper = new MegaPkScraper();
  const ingestionService = new PriceIngestionService();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const targets = [
    { cat: 'mobiles', url: 'https://www.mega.pk/mobiles/' },
    { cat: 'laptops', url: 'https://www.mega.pk/laptop-price-pakistan/' },
  ];

  const scrapedProducts: any[] = [];

  for (const target of targets) {
    console.log(`\nNavigating to Mega.pk category: ${target.url} (${target.cat})`);
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('_products/') || href.includes('-price-pakistan.html'))) {
        const fullUrl = href.startsWith('http') ? href : `https://www.mega.pk/${href.replace(/^\//, '')}`;
        if (!links.includes(fullUrl)) links.push(fullUrl);
      }
    });

    console.log(`Discovered ${links.length} product links in ${target.cat}. Scraping top 3...`);
    const toScrape = links.slice(0, 3);

    for (const link of toScrape) {
      console.log(`  Scraping: ${link}`);
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        const prodHtml = await page.content();
        const extracted = megaScraper.extractFromHtml(prodHtml, link);
        if (extracted) {
          const valid = megaScraper.validateProduct(extracted);
          if (valid) {
            console.log(`    ✅ Extracted: ${valid.name} | Price: PKR ${valid.price} | ID: ${valid.sourceIdentifier} (${valid.sourceIdentifierType}) | Image: ${valid.imageUrl ? 'YES' : 'NO'}`);
            scrapedProducts.push(valid);
          }
        }
      } catch (err: any) {
        console.error(`    ❌ Failed to scrape ${link}:`, err.message);
      }
    }
  }

  await browser.close();

  console.log(`\nTotal products extracted from Mega.pk: ${scrapedProducts.length}`);

  let mobilesPersisted = 0;
  let laptopsPersisted = 0;

  for (const p of scrapedProducts) {
    console.log(`\nIngesting: ${p.name}`);
    const res = await ingestionService.ingest(p, store.id, false);
    console.log(`  Ingestion result: ${res.action} (variant: ${res.variantId})`);
    if (res.action === 'created' || res.action === 'updated') {
      const lower = p.name.toLowerCase();
      if (lower.includes('macbook') || lower.includes('laptop') || lower.includes('ideapad') || lower.includes('notebook')) {
        laptopsPersisted++;
      } else {
        mobilesPersisted++;
      }
    }
  }

  console.log('\n=============================================================');
  console.log(`Mega.pk Ingestion Summary: Mobiles=${mobilesPersisted}, Laptops=${laptopsPersisted}`);
  console.log('=============================================================');
}

main().catch(err => {
  console.error('Fatal Mega.pk error:', err);
  process.exit(1);
});
