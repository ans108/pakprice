/**
 * Increment 7C — Phase 2: Fix Variant RAM/Storage Separation on Samsung Galaxy A07 & Audit URLs
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log('=== Increment 7C - Phase 2: Fix Samsung Galaxy A07 Variants & Audit URLs ===\n');

  // 1. Find Samsung Galaxy A07 product
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, name, slug, brand_id, category_id')
    .eq('slug', 'samsung-samsung-galaxy-a07-dual-sim-with-official-warranty')
    .single();

  if (!product) {
    console.error('Samsung Galaxy A07 product not found:', pErr);
    return;
  }

  console.log(`Product: ${product.name} (ID: ${product.id})`);

  // 2. Fetch existing variants
  const { data: variants, error: vErr } = await supabase
    .from('product_variants')
    .select('id, name, ram_gb, storage_gb, color, model_number, is_active')
    .eq('product_id', product.id);

  if (vErr) {
    console.error('Error fetching variants:', vErr);
    return;
  }

  console.log(`Existing variants: ${variants?.length}`);
  console.log(JSON.stringify(variants, null, 2));

  // 3. Fetch all prices currently attached to any variant of this product
  const variantIds = (variants || []).map(v => v.id);
  const { data: prices, error: prErr } = await supabase
    .from('prices')
    .select('id, variant_id, store_id, price, original_price, product_url, in_stock, stores(slug, name)')
    .in('variant_id', variantIds);

  console.log(`\nExisting prices (${prices?.length}):`);
  for (const p of prices || []) {
    const s = (p as any).stores;
    console.log(`  [${s?.slug}] Rs. ${Number(p.price).toLocaleString()} | URL: ${p.product_url}`);
  }

  // 4. Audit URLs on Samsung Galaxy A07
  console.log('\nAuditing live URLs for Samsung Galaxy A07 offers:');
  const validOffers: typeof prices = [];
  const invalidPriceIds: string[] = [];

  for (const p of prices || []) {
    const s = (p as any).stores;
    const url = p.product_url;

    // Check if url is empty, bare domain, or generic category
    if (!url || url === 'https://www.metro-online.pk/' || url === 'https://www.carrefour.pk/' || url.endsWith('/products/') || url.endsWith('/p/')) {
      console.log(` ✗ Invalid generic URL on ${s?.slug}: ${url}`);
      invalidPriceIds.push(p.id);
      continue;
    }

    // Live HTTP check with polite User-Agent
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500, // consider 200-499
      });

      console.log(` [HTTP ${resp.status}] ${s?.slug} -> ${url}`);
      if (resp.status === 404) {
        console.log(`   -> 404 Not Found! Flagging for removal.`);
        invalidPriceIds.push(p.id);
      } else {
        validOffers.push(p);
      }
    } catch (err: any) {
      console.log(` [ERROR ${err.message}] ${s?.slug} -> ${url}`);
      // If network error / anti-bot 403 on protected domains (like daraz or cloudflare), inspect URL string
      if (url.includes('daraz.pk/products/samsung-galaxy-a07') || url.includes('priceoye.pk/mobiles/samsung/samsung-galaxy-a07') || url.includes('telemart.pk/products/samsung-galaxy-a07')) {
        console.log(`   -> Known valid retailer PDP pattern preserved.`);
        validOffers.push(p);
      } else {
        invalidPriceIds.push(p.id);
      }
    }
  }

  // Remove invalid price rows
  if (invalidPriceIds.length > 0) {
    console.log(`\nRemoving ${invalidPriceIds.length} invalid price rows...`);
    await supabase.from('prices').delete().in('id', invalidPriceIds);
  }

  // 5. Separate Variants (4GB / 64GB vs 6GB / 128GB)
  console.log('\n--- Variant RAM/Storage Alignment ---');
  let defaultVariant = variants?.[0];
  if (!defaultVariant) {
    const { data: newV } = await supabase.from('product_variants').insert({
      product_id: product.id,
      name: '4GB / 64GB',
      ram_gb: 4,
      storage_gb: 64,
      is_active: true,
    }).select().single();
    defaultVariant = newV;
  } else {
    // Update default variant to 4GB / 64GB
    await supabase
      .from('product_variants')
      .update({
        name: '4GB / 64GB',
        ram_gb: 4,
        storage_gb: 64,
      })
      .eq('id', defaultVariant.id);
    console.log(`Updated default variant ${defaultVariant.id} to 4GB / 64GB`);
  }

  // Check if 6GB / 128GB variant exists, or create it
  let v6_128 = variants?.find(v => v.ram_gb === 6 && v.storage_gb === 128);
  if (!v6_128) {
    const { data: newV, error: v6Err } = await supabase.from('product_variants').insert({
      product_id: product.id,
      name: '6GB / 128GB',
      ram_gb: 6,
      storage_gb: 128,
      is_active: true,
    }).select().single();

    if (v6Err) {
      console.error('Failed to create 6GB / 128GB variant:', v6Err);
    } else {
      v6_128 = newV;
      console.log(`Created 6GB / 128GB variant: ${v6_128?.id}`);
    }
  } else {
    console.log(`Existing 6GB / 128GB variant: ${v6_128.id}`);
  }

  // Check if 4GB / 128GB variant exists (if Metro or another store has 4/128GB)
  let v4_128 = variants?.find(v => v.ram_gb === 4 && v.storage_gb === 128);

  // 6. Partition prices by variant tier
  // Re-fetch current prices for this product
  const { data: currentPrices } = await supabase
    .from('prices')
    .select('id, variant_id, store_id, price, product_url, stores(slug, name)')
    .in('variant_id', [...(variants || []).map(v => v.id), v6_128?.id, v4_128?.id].filter(Boolean));

  console.log(`\nRe-assigning offers to correct variants:`);
  for (const pr of currentPrices || []) {
    const url = pr.product_url || '';
    const s = (pr as any).stores;

    // Detect if this offer is 6GB/128GB
    if (url.includes('6gb') || url.includes('6-128') || url.includes('6gb128gb')) {
      if (v6_128 && pr.variant_id !== v6_128.id) {
        console.log(` -> Moving ${s?.slug} offer (Rs. ${Number(pr.price).toLocaleString()}) to 6GB / 128GB variant`);
        await supabase.from('prices').update({ variant_id: v6_128.id }).eq('id', pr.id);
      }
    } else if (url.includes('4gb-128gb') || url.includes('4-128')) {
      // 4GB / 128GB
      if (!v4_128) {
        const { data: new4_128 } = await supabase.from('product_variants').insert({
          product_id: product.id,
          name: '4GB / 128GB',
          ram_gb: 4,
          storage_gb: 128,
          is_default: false,
        }).select().single();
        v4_128 = new4_128;
      }
      if (v4_128 && pr.variant_id !== v4_128.id) {
        console.log(` -> Moving ${s?.slug} offer (Rs. ${Number(pr.price).toLocaleString()}) to 4GB / 128GB variant`);
        await supabase.from('prices').update({ variant_id: v4_128.id }).eq('id', pr.id);
      }
    } else {
      // 4GB / 64GB
      if (defaultVariant && pr.variant_id !== defaultVariant.id) {
        console.log(` -> Moving ${s?.slug} offer (Rs. ${Number(pr.price).toLocaleString()}) to 4GB / 64GB variant`);
        await supabase.from('prices').update({ variant_id: defaultVariant.id }).eq('id', pr.id);
      }
    }
  }

  // 7. Final Variant & Offer Summary
  console.log('\n=================================================================');
  console.log(' SAMSUNG GALAXY A07 FINAL VARIANT & OFFER AUDIT');
  console.log('=================================================================');

  const { data: finalVariants } = await supabase
    .from('product_variants')
    .select(`
      id,
      name,
      ram_gb,
      storage_gb,
      prices (
        id,
        price,
        product_url,
        in_stock,
        stores (
          slug,
          name
        )
      )
    `)
    .eq('product_id', product.id)
    .order('created_at', { ascending: true });

  for (const v of finalVariants || []) {
    console.log(`\n### Variant: ${v.name} (RAM: ${v.ram_gb}GB, Storage: ${v.storage_gb}GB)`);
    const pList = (v as any).prices || [];
    console.log(`Offers count: ${pList.length}`);
    for (const p of pList) {
      console.log(`  - ${p.stores?.name.padEnd(14)} [${p.stores?.slug.padEnd(12)}]: Rs. ${Number(p.price).toLocaleString()} | URL: ${p.product_url}`);
    }
  }

  console.log('\nPhase 2 Complete: Samsung Galaxy A07 variants separated, URLs audited.');
}

run().catch(console.error);
