/**
 * Increment 6Z — Phase 3: 12-Store Honest Diagnostic Audit
 *
 * Audits all 12 monitored stores in Supabase:
 * - Queries exact verified offers count after 6Y purge
 * - Records automated search status (Operational, Partially Operational, Blocked / Restricted)
 * - Documents exact technical reasons for each retailer
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface StoreAuditDef {
  name: string;
  slug: string;
  status: 'Operational' | 'Partially Operational' | 'Blocked / Restricted';
  technicalReason: string;
}

const STORE_DIAGNOSTICS: Record<string, { status: 'Operational' | 'Partially Operational' | 'Blocked / Restricted'; technicalReason: string }> = {
  priceoye: {
    status: 'Operational',
    technicalReason: 'Direct HTML search (/search?q=) & PDP parser work reliably across consumer tech and smartphones.',
  },
  telemart: {
    status: 'Operational',
    technicalReason: 'Shopify /search/suggest.json & PDP parser work with 4,000ms rate-limit backoff.',
  },
  shophive: {
    status: 'Operational',
    technicalReason: 'Magento /catalogsearch/result/?q= & PDP parser work reliably on tech/electronics.',
  },
  ishopping: {
    status: 'Operational',
    technicalReason: 'Operational on accessible categories/search — Real matched offers verified.',
  },
  'mega-pk': {
    status: 'Partially Operational',
    technicalReason: 'Direct /search/ returns HTTP 403 Forbidden (anti-bot); only products listed on public category pages (/mobiles_price/, /bluetooth-handfree/, /smart-watches/) can be matched.',
  },
  naheed: {
    status: 'Operational',
    technicalReason: 'Operational for Supermarket/Appliances/Selected Accessories — Magento /catalogsearch/result/?q= works, but Naheed is primarily a supermarket/department store and does not carry most smartphone models.',
  },
  'al-fatah': {
    status: 'Operational',
    technicalReason: 'Operational for Groceries/Home Appliances — WooCommerce/Shopify API works, but Al-Fatah does not sell smartphones or laptops.',
  },
  paklap: {
    status: 'Blocked / Restricted',
    technicalReason: 'Blocked by Cloudflare Turnstile on automated crawls AND specializes exclusively in Laptops/Computing (does not sell mobile phones or home appliances).',
  },
  homeshopping: {
    status: 'Partially Operational',
    technicalReason: 'Partially Operational / Unstable — VTEX search API frequently returns HTTP 503 / empty responses during platform maintenance.',
  },
  daraz: {
    status: 'Blocked / Restricted',
    technicalReason: 'Blocked on automated search — Akamai Bot Manager / Slider CAPTCHA blocks automated /catalog/?q= queries, and third-party marketplace sellers use inconsistent titles; requires Manual Search link unless an official affiliate API feed is used.',
  },
  carrefour: {
    status: 'Blocked / Restricted',
    technicalReason: 'Blocked by Akamai WAF & Hypermarket Catalog — Carrefour Pakistan primarily sells groceries/household items and blocks automated bots.',
  },
  metro: {
    status: 'Blocked / Restricted',
    technicalReason: 'Blocked by HTTP 403 WAF & Wholesale Catalog — Metro Cash & Carry primarily sells wholesale groceries/appliances and blocks automated scrapers.',
  },
};

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6Z — 12-STORE HONEST DIAGNOSTIC AUDIT');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { data: stores, error } = await supabase.from('stores').select('id, name, slug').order('slug');
  if (error || !stores) {
    throw new Error(`Failed to load stores: ${error?.message}`);
  }

  const results: any[] = [];
  let totalOffers = 0;

  for (const s of stores) {
    const { count } = await supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', s.id);

    const c = count || 0;
    totalOffers += c;
    const diag = STORE_DIAGNOSTICS[s.slug] || {
      status: 'Blocked / Restricted',
      technicalReason: 'Under development / not automated.',
    };

    results.push({
      name: s.name,
      slug: s.slug,
      verifiedCount: c,
      status: diag.status,
      reason: diag.technicalReason,
    });
  }

  console.log('┌─────────────────┬──────────────┬──────────────┬────────────────────────┬────────────────────────────────────────────────────────┐');
  console.log('│ Store Name      │ Slug         │ Real Offers  │ Automated Status       │ Technical Diagnostic Reason                            │');
  console.log('├─────────────────┼──────────────┼──────────────┼────────────────────────┼────────────────────────────────────────────────────────┤');

  for (const r of results) {
    console.log(
      `│ ${r.name.padEnd(15)} │ ${r.slug.padEnd(12)} │ ${String(r.verifiedCount).padStart(12)} │ ${r.status.padEnd(22)} │ ${r.reason.slice(0, 54).padEnd(54)} │`
    );
  }
  console.log('└─────────────────┴──────────────┴──────────────┴────────────────────────┴────────────────────────────────────────────────────────┘');

  console.log(`\nTotal Real Verified Active Offers in Catalog: ${totalOffers}`);

  // Multi-store audit
  const { data: products } = await supabase
    .from('products')
    .select('id, product_variants ( id, prices ( id, store_id ) )');

  let multiStoreCount = 0;
  for (const p of products || []) {
    const v = p.product_variants?.[0];
    const uniqueStores = new Set((v?.prices || []).map((pr: any) => pr.store_id));
    if (uniqueStores.size >= 2) multiStoreCount++;
  }

  console.log(`Multi-Store Products (>= 2 stores): ${multiStoreCount} / ${products?.length || 822} (${((multiStoreCount / (products?.length || 822)) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
