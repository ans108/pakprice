import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { deriveAvailabilityStatus } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('===============================================================');
  console.log('  FINAL 6E LOCK CHECK: COMPREHENSIVE VERIFICATION SCRIPT');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────
  // CHECK 1: CANONICAL VARIANT FIELDS & PER-STORE INDEPENDENT SPECS
  // ─────────────────────────────────────────────────────────────
  console.log('── CHECK 1: CANONICAL VARIANT FIELDS & STORE SPEC AUDIT ──\n');

  const targetVariants = [
    {
      name: 'Apple iPhone 17 Pro Max',
      id: '621cdabd-c2f6-42e5-8a20-2bd52d4b6374',
      store1: { name: 'PriceOye', url: 'https://priceoye.pk/mobiles/apple/apple-iphone-17-pro-max' },
      store2: { name: 'Mega.pk', url: 'https://www.mega.pk/mobiles_products/26774/Apple-iPhone-17-Pro-Max.html' }
    },
    {
      name: 'Samsung Galaxy Watch 8 40mm',
      id: '3486efcf-79a1-408e-9e04-8d7792e72a64',
      store1: { name: 'Telemart', url: 'https://www.telemart.pk/collections/mens-watches/products/samsung-galaxy-watch-8-40mm' },
      store2: { name: 'Mega.pk', url: 'https://www.mega.pk/watches_products/26849/Samsung-Galaxy-Watch-8-40mm.html' }
    },
    {
      name: 'Xiaomi Mi Smart Band 10',
      id: 'c0b3c400-7747-470d-9e4c-6ac885d2154c',
      store1: { name: 'Telemart', url: 'https://www.telemart.pk/products/xiaomi-mi-smart-band-10' },
      store2: { name: 'Mega.pk', url: 'https://www.mega.pk/watches_products/26904/Xiaomi-Mi-Smart-Band-10.html' }
    }
  ];

  for (const t of targetVariants) {
    console.log(`\n### Target: ${t.name} (Variant ID: ${t.id})`);
    
    // 1. Live DB Variant row
    const { data: v } = await db.from('product_variants').select('*').eq('id', t.id).single();
    console.log('Database product_variants row:');
    console.log(`  - name: "${v?.name}"`);
    console.log(`  - ram_gb: ${v?.ram_gb}`);
    console.log(`  - storage_gb: ${v?.storage_gb}`);
    console.log(`  - color: ${v?.color ? `"${v.color}"` : null}`);
    console.log(`  - model_number: ${v?.model_number ? `"${v.model_number}"` : null}`);
    console.log(`  - sku: ${v?.sku ? `"${v.sku}"` : null}`);
    console.log(`  - source_identifier: ${v?.source_identifier ? `"${v.source_identifier}"` : null}`);

    // 2. Live DB Store Identifiers
    const { data: idents } = await db.from('store_product_identifiers').select('*, stores(name, slug)').eq('variant_id', t.id);
    console.log('Database store_product_identifiers:');
    for (const id of idents || []) {
      console.log(`  - [${id.stores?.name}] type: ${id.identifier_type}, identifier: "${id.identifier}"`);
    }

    // 3. Inspect Store 1 PDP
    console.log(`\nScraping Store 1 (${t.store1.name}): ${t.store1.url}`);
    try {
      const res1 = await axios.get(t.store1.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const $1 = cheerio.load(res1.data);
      const text1 = $1('body').text().toLowerCase();
      const title1 = $1('title').text().trim();
      const storageMatch1 = text1.match(/(256\s*gb|512\s*gb|1\s*tb|128\s*gb)/gi) || [];
      const ramMatch1 = text1.match(/(\d+\s*gb\s*ram|\d+\s*gb(?=\s*\/))/gi) || [];
      console.log(`  Title: "${title1}"`);
      console.log(`  Storage mentions: ${Array.from(new Set(storageMatch1)).join(', ') || 'None'}`);
      console.log(`  RAM mentions: ${Array.from(new Set(ramMatch1)).join(', ') || 'None'}`);
    } catch (e: any) {
      console.log(`  Failed to fetch Store 1: ${e.message}`);
    }

    // 4. Inspect Store 2 PDP
    console.log(`Scraping Store 2 (${t.store2.name}): ${t.store2.url}`);
    try {
      const res2 = await axios.get(t.store2.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const $2 = cheerio.load(res2.data);
      const title2 = $2('title').text().trim();
      const text2 = $2('body').text().toLowerCase();
      const storageMatch2 = text2.match(/(256\s*gb|512\s*gb|1\s*tb|128\s*gb)/gi) || [];
      const ramMatch2 = text2.match(/(\d+\s*gb\s*ram|\d+\s*gb(?=\s*\/))/gi) || [];
      console.log(`  Title: "${title2}"`);
      console.log(`  Storage mentions: ${Array.from(new Set(storageMatch2)).join(', ') || 'None'}`);
      console.log(`  RAM mentions: ${Array.from(new Set(ramMatch2)).join(', ') || 'None'}`);
    } catch (e: any) {
      console.log(`  Failed to fetch Store 2: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK 2: DARAZ CONTROLLED INGEST AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n── CHECK 2: DARAZ CONTROLLED-INGEST AUDIT ──\n');
  const darazVariantId = '6e8c2c4b-5b28-4ee1-8e6d-60bcecc28886';
  
  const { data: darazVariant } = await db.from('product_variants').select('*, products(*)').eq('id', darazVariantId).single();
  console.log('Daraz Variant in DB:');
  console.log(`  Product: "${darazVariant?.products?.name}"`);
  console.log(`  Variant ID: ${darazVariant?.id}`);
  console.log(`  Created at: ${darazVariant?.created_at}`);

  const { data: darazPrices } = await db.from('prices').select('*').eq('variant_id', darazVariantId);
  console.log('Prices for Daraz Variant:');
  console.dir(darazPrices, { depth: null });

  const { data: darazHistory } = await db.from('price_history').select('*').eq('variant_id', darazVariantId).order('scraped_at', { ascending: true });
  console.log(`Price History count for Daraz Variant: ${darazHistory?.length}`);
  for (const h of darazHistory || []) {
    console.log(`  - History ID: ${h.id} | Price: ${h.price} | scraped_at: ${h.scraped_at}`);
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK 3: 5C FRESHNESS STATE TABLE GENERATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n── CHECK 3: 5C FRESHNESS DERIVATION TABLE ──\n');
  const now = new Date();
  console.log(`Current Reference Time: ${now.toISOString()}`);
  
  for (const t of targetVariants) {
    const { data: prices } = await db.from('prices').select('*, stores(name, slug)').eq('variant_id', t.id);
    for (const p of prices || []) {
      const scrapedAt = p.last_scraped_at;
      const status = deriveAvailabilityStatus(p.in_stock, scrapedAt, 72);
      const hoursAgo = scrapedAt ? ((now.getTime() - new Date(scrapedAt).getTime()) / (1000 * 60 * 60)).toFixed(1) : 'N/A';
      
      let freshnessCategory = 'Unknown';
      if (scrapedAt) {
        freshnessCategory = Number(hoursAgo) <= 72 ? 'Fresh' : 'Stale';
      }

      console.log(`[${t.name}] Store: ${p.stores?.name}`);
      console.log(`  - Price: PKR ${p.price}`);
      console.log(`  - in_stock: ${p.in_stock}`);
      console.log(`  - last_scraped_at: ${scrapedAt} (${hoursAgo} hours ago)`);
      console.log(`  - 5C Freshness State: ${freshnessCategory}`);
      console.log(`  - 5C Derived Availability: ${status}`);
      console.log(`  - Product URL: ${p.product_url}\n`);
    }
  }
}

main().catch(console.error);
