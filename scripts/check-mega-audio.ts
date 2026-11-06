import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkAudio() {
  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const urls = [
    'https://www.mega.pk/headphones-price-pakistan/',
    'https://www.mega.pk/earphones-price-pakistan/',
    'https://www.mega.pk/airpods-price-pakistan/',
    'https://www.mega.pk/wireless-earbuds-price-pakistan/',
  ];

  for (const u of urls) {
    try {
      const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 });
      console.log(u, 'status:', resp?.status(), 'url:', page.url());
      const html = await page.content();
      const $ = cheerio.load(html);
      const links: string[] = [];
      $('a[href*="_products/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !links.includes(href)) links.push(href);
      });
      console.log('  Items found:', links.length);
      links.slice(0, 5).forEach(l => console.log('   *', l));
    } catch (e: any) {
      console.error(u, e.message);
    }
  }

  await browser.close();
}

checkAudio().catch(console.error);
