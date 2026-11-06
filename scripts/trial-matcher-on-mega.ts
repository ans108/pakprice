import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright';
import * as fs from 'fs';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== INCREMENT 6E: PRODUCT MATCHER TRIAL ON MEGA.PK LINKS ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'mega-pk').single();
  if (!store) throw new Error('Mega.pk store not found');

  const allLinks: { cat: string; url: string }[] = JSON.parse(
    fs.readFileSync('scratch/all-mega-links.json', 'utf8')
  );

  console.log(`Loaded ${allLinks.length} discovered Mega.pk URLs.\n`);

  const scraper = new MegaPkScraper();
  const matcher = new ProductMatcher();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const matchResults: any[] = [];

  // Test across discovered products
  // Take up to 40 items to test real extraction and matching
  const testLinks = allLinks.slice(0, 45);

  for (let i = 0; i < testLinks.length; i++) {
    const item = testLinks[i];
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      const html = await page.content();
      const extracted = scraper.extractFromHtml(html, item.url);

      if (!extracted) {
        console.log(`[${i + 1}/${testLinks.length}] Extracted NULL: ${item.url}`);
        continue;
      }

      const validated = scraper.validateProduct(extracted);
      if (!validated) {
        console.log(`[${i + 1}/${testLinks.length}] Validation failed: ${extracted.name}`);
        continue;
      }

      // Run through REAL ProductMatcher (READ-ONLY)
      const res = await matcher.match(validated, store.id);

      const summary = {
        name: validated.name,
        price: validated.price,
        ram: validated.ramGb,
        storage: validated.storageGb,
        identifier: validated.sourceIdentifier,
        url: item.url,
        matchStatus: res.status,
        matchMethod: res.method,
        confidence: res.confidence,
        matchedProduct: res.product?.name || null,
        matchedVariant: res.variant?.id || null,
        reason: res.reason,
      };

      matchResults.push(summary);

      if (res.status === 'matched') {
        console.log(`\n🎉 [MATCHED] [${res.method}]`);
        console.log(`   Mega:     "${validated.name}" (Price: PKR ${validated.price})`);
        console.log(`   DB Prod:  "${res.product?.name}" (Variant: ${res.variant?.id})`);
        console.log(`   Conf:     ${res.confidence} | URL: ${item.url}\n`);
      } else if (res.status === 'ambiguous') {
        console.log(`⚠️  [AMBIGUOUS] "${validated.name}" -> ${res.reason} (candidates: ${res.candidates.length})`);
      } else {
        console.log(`ℹ️  [NO_MATCH] "${validated.name}"`);
      }
    } catch (err: any) {
      console.warn(`Error on ${item.url}:`, err.message);
    }
  }

  await browser.close();

  const matched = matchResults.filter(r => r.matchStatus === 'matched');
  const ambiguous = matchResults.filter(r => r.matchStatus === 'ambiguous');
  const noMatch = matchResults.filter(r => r.matchStatus === 'no_match');

  console.log('\n=============================================================');
  console.log(`SUMMARY: Tested=${matchResults.length}, Matched=${matched.length}, Ambiguous=${ambiguous.length}, NoMatch=${noMatch.length}`);
  console.log('=============================================================');

  fs.writeFileSync('scratch/mega-trial-matches.json', JSON.stringify(matchResults, null, 2), 'utf8');
}

main().catch(console.error);
