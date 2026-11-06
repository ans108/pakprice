import { ScraperRegistry } from '../apps/scraper/src/scrapers/ScraperRegistry';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function auditStores() {
  const { data: stores } = await supabase.from('stores').select('*').order('sort_order', { ascending: true });
  const registry = ScraperRegistry.getInstance();

  const { data: prices } = await supabase.from('prices').select('store_id');
  const countMap: Record<string, number> = {};
  for (const p of prices || []) {
    countMap[p.store_id] = (countMap[p.store_id] || 0) + 1;
  }

  console.log('=== STORE-BY-STORE COVERAGE AUDIT ===');
  console.log('| Store | Slug | Has Scraper | DB Price Count | Tier | Blocking Issue / Status |');
  console.log('|---|---|---|---|---|---|');

  for (const s of stores || []) {
    const hasScraper = registry.has(s.slug);
    const count = countMap[s.id] || 0;
    let tier = 'Tier 3';
    let blocking = 'No scraper implementation in registry';

    if (['priceoye', 'telemart', 'mega-pk', 'shophive'].includes(s.slug)) {
      tier = 'Tier 1';
      blocking = 'Active Production Scraper';
    } else if (['daraz', 'paklap'].includes(s.slug)) {
      tier = 'Tier 2';
      blocking = s.slug === 'daraz' ? 'Cloudflare anti-bot challenge' : 'Specialized catalog (Laptops)';
    } else if (['homeshopping', 'ishopping'].includes(s.slug)) {
      tier = 'Tier 2';
      blocking = 'Scraper not yet registered';
    }

    console.log(`| ${s.name} | ${s.slug} | ${hasScraper ? 'Yes' : 'No'} | ${count} | ${tier} | ${blocking} |`);
  }
}

auditStores().catch(console.error);
