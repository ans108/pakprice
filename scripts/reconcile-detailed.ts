import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('=== DETAILED RECONCILIATION AUDIT ===\n');

  // Fetch all stores
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map<string, string>();
  for (const s of stores || []) storeMap.set(s.id, s.slug);

  // Fetch all products
  const { data: products } = await supabase.from('products').select('id, name, created_at').limit(1000);
  // Fetch all variants
  const { data: variants } = await supabase.from('product_variants').select('id, product_id, created_at').limit(1000);
  // Fetch all prices
  const { data: prices } = await supabase.from('prices').select('id, variant_id, store_id, price, created_at').limit(1000);
  // Fetch all identifiers
  const { data: identifiers } = await supabase.from('store_product_identifiers').select('id, variant_id, store_id, identifier_type, identifier').limit(1000);
  // Fetch all price_history
  const { count: historyCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true });

  console.log(`Total Products in DB:   ${products?.length}`);
  console.log(`Total Variants in DB:   ${variants?.length}`);
  console.log(`Total Prices in DB:     ${prices?.length}`);
  console.log(`Total Identifiers in DB:${identifiers?.length}`);
  console.log(`Total History in DB:    ${historyCount}\n`);

  // Map variant_id -> product_id
  const variantToProduct = new Map<string, string>();
  for (const v of variants || []) variantToProduct.set(v.id, v.product_id);

  // Per store price counts and distinct variant counts
  const storePriceMap = new Map<string, { priceCount: number; variantIds: Set<string>; productIds: Set<string> }>();
  for (const s of stores || []) {
    storePriceMap.set(s.slug, { priceCount: 0, variantIds: new Set(), productIds: new Set() });
  }

  for (const p of prices || []) {
    const storeSlug = storeMap.get(p.store_id) || 'unknown';
    const entry = storePriceMap.get(storeSlug);
    if (entry) {
      entry.priceCount++;
      entry.variantIds.add(p.variant_id);
      const prodId = variantToProduct.get(p.variant_id);
      if (prodId) entry.productIds.add(prodId);
    }
  }

  console.log('--- Price, Variant & Product counts per store ---');
  for (const [slug, data] of storePriceMap.entries()) {
    if (data.priceCount > 0) {
      console.log(`Store: ${slug.padEnd(12)} | Prices: ${String(data.priceCount).padStart(4)} | Variants: ${String(data.variantIds.size).padStart(4)} | Products: ${String(data.productIds.size).padStart(4)}`);
    }
  }

  // Multi-store variants and products
  const variantStores = new Map<string, Set<string>>();
  for (const p of prices || []) {
    if (!variantStores.has(p.variant_id)) variantStores.set(p.variant_id, new Set());
    variantStores.get(p.variant_id)!.add(storeMap.get(p.store_id) || p.store_id);
  }

  const multiStoreVariants: string[] = [];
  for (const [vId, sSet] of variantStores.entries()) {
    if (sSet.size > 1) multiStoreVariants.push(vId);
  }

  console.log(`\nVariants priced by > 1 store: ${multiStoreVariants.length}`);

  // Products with prices in DB
  const productStoreMap = new Map<string, Set<string>>();
  for (const p of prices || []) {
    const prodId = variantToProduct.get(p.variant_id);
    if (prodId) {
      if (!productStoreMap.has(prodId)) productStoreMap.set(prodId, new Set());
      productStoreMap.get(prodId)!.add(storeMap.get(p.store_id) || p.store_id);
    }
  }

  let multiStoreProductCount = 0;
  for (const sSet of productStoreMap.values()) {
    if (sSet.size > 1) multiStoreProductCount++;
  }
  console.log(`Products priced by > 1 store: ${multiStoreProductCount}`);

  // Products with NO current price
  const productsWithPrices = new Set(productStoreMap.keys());
  const unpricedProducts = (products || []).filter(p => !productsWithPrices.has(p.id));
  console.log(`Products with NO price in DB: ${unpricedProducts.length}`);
  for (const up of unpricedProducts) {
    console.log(`  Unpriced: ${up.name} (${up.id})`);
  }

  // Check Telemart 534:
  // How many Telemart prices were added in 6B vs 6A?
  // Let's check Telemart identifier breakdown
  const telemartStoreId = stores?.find(s => s.slug === 'telemart')?.id;
  const tmPrices = (prices || []).filter(p => p.store_id === telemartStoreId);
  const tmVariants = new Set(tmPrices.map(p => p.variant_id));
  console.log(`\nTelemart distinct variants: ${tmVariants.size}`);

  // How many of Telemart's variants are shared with PriceOye?
  let telemartSharedWithPriceoye = 0;
  for (const vId of tmVariants) {
    if (variantStores.get(vId)?.has('priceoye')) {
      telemartSharedWithPriceoye++;
    }
  }
  console.log(`Telemart variants shared with PriceOye: ${telemartSharedWithPriceoye}`);
  console.log(`Telemart variants unique to Telemart:   ${tmVariants.size - telemartSharedWithPriceoye}`);

  // Mega.pk shared with PriceOye or others:
  const megaStoreId = stores?.find(s => s.slug === 'mega-pk')?.id;
  const megaPrices = (prices || []).filter(p => p.store_id === megaStoreId);
  for (const mp of megaPrices) {
    const prodId = variantToProduct.get(mp.variant_id);
    const prod = products?.find(p => p.id === prodId);
    console.log(`Mega product: ${prod?.name} (stores: ${Array.from(variantStores.get(mp.variant_id) || []).join(', ')})`);
  }
}

main().catch(console.error);
