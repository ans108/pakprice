import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { chromium } from 'playwright';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== MATCHING HARVESTED MEGA.PK LAPTOPS AGAINST CATALOG ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk store not found');

  const harvested: { cat: string; url: string; title: string }[] = JSON.parse(
    fs.readFileSync('scratch/mega-laptops-harvested.json', 'utf8')
  );

  console.log(`Loaded ${harvested.length} harvested laptop URLs.`);

  const scraper = new MegaPkScraper();
  const matcher = new ProductMatcher();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results: any[] = [];
  const matchesFound: any[] = [];

  // Inspect first 35 items
  const countToTest = Math.min(harvested.length, 35);

  for (let i = 0; i < countToTest; i++) {
    const item = harvested[i];
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(800);
      const html = await page.content();
      const extracted = scraper.extractFromHtml(html, item.url);

      if (!extracted) continue;
      const validated = scraper.validateProduct(extracted);
      if (!validated) continue;

      const res = await matcher.match(validated, store.id);

      results.push({
        url: item.url,
        name: validated.name,
        price: validated.price,
        status: res.status,
        method: res.method,
        matchedProduct: res.product?.name,
        variantId: res.variant?.id,
      });

      if (res.status === 'matched') {
        matchesFound.push({
          url: item.url,
          name: validated.name,
          price: validated.price,
          method: res.method,
          matchedProduct: res.product?.name,
          variantId: res.variant?.id,
        });
        console.log(`\n🎉 [MATCHED ${res.method}]`);
        console.log(`   Mega:     "${validated.name}" (PKR ${validated.price})`);
        console.log(`   DB:       "${res.product?.name}" (Variant: ${res.variant?.id})`);
        console.log(`   URL:      ${item.url}`);
      }
    } catch (e: any) {
      // skip errors
    }
  }

  await browser.close();

  console.log(`\n=============================================================`);
  console.log(`Total Tested: ${results.length}, Matched: ${matchesFound.length}`);
  console.log(`=============================================================`);

  fs.writeFileSync('scratch/laptops-matched.json', JSON.stringify(matchesFound, null, 2), 'utf8');
}

main().catch(console.error);
