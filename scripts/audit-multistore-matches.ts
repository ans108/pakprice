import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('=============================================================');
  console.log('  MULTI-STORE MATCH AUDIT & VARIANT COMPARISON (INCREMENT 6B)');
  console.log('=============================================================\n');

  // Fetch stores
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map<string, string>();
  for (const s of stores || []) storeMap.set(s.id, s.slug);

  // Fetch prices
  const { data: prices, error: pricesErr } = await supabase
    .from('prices')
    .select('id, variant_id, store_id, price, original_price, in_stock, updated_at');
  if (pricesErr) console.error('Prices error:', pricesErr);

  // Fetch variants
  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, product_id, sku, ram_gb, storage_gb, color');

  // Fetch products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, brand_id, category_id');

  // Fetch store product identifiers
  const { data: identifiers } = await supabase
    .from('store_product_identifiers')
    .select('store_id, variant_id, identifier_type, identifier');

  const variantMap = new Map<string, any>();
  for (const v of variants || []) variantMap.set(v.id, v);

  const productMap = new Map<string, any>();
  for (const p of products || []) productMap.set(p.id, p);

  // Group prices by variant
  const variantPrices = new Map<string, any[]>();
  for (const pr of prices || []) {
    if (!variantPrices.has(pr.variant_id)) variantPrices.set(pr.variant_id, []);
    variantPrices.get(pr.variant_id)!.push(pr);
  }

  // Multi-store variants
  const multiStoreVariants: any[] = [];
  for (const [vId, prs] of variantPrices.entries()) {
    const storeIds = new Set(prs.map(p => p.store_id));
    if (storeIds.size > 1) {
      const v = variantMap.get(vId);
      const prod = v ? productMap.get(v.product_id) : null;
      const vIdents = (identifiers || []).filter(i => i.variant_id === vId);
      multiStoreVariants.push({
        variantId: vId,
        productId: v?.product_id,
        productName: prod?.name || 'Unknown',
        ramGb: v?.ram_gb,
        storageGb: v?.storage_gb,
        color: v?.color,
        stores: Array.from(storeIds).map(id => storeMap.get(id) || id),
        prices: prs.map(p => ({
          store: storeMap.get(p.store_id) || p.store_id,
          price: p.price,
          originalPrice: p.original_price,
          inStock: p.in_stock,
        })),
        identifiers: vIdents.map(i => ({
          store: storeMap.get(i.store_id),
          type: i.identifier_type,
          identifier: i.identifier,
        })),
      });
    }
  }

  // Multi-store products (products that have variants across > 1 store, even if different variants)
  const productStores = new Map<string, Set<string>>();
  for (const pr of prices || []) {
    const v = variantMap.get(pr.variant_id);
    if (v) {
      if (!productStores.has(v.product_id)) productStores.set(v.product_id, new Set());
      productStores.get(v.product_id)!.add(pr.store_id);
    }
  }

  let multiStoreProductCount = 0;
  for (const s of productStores.values()) {
    if (s.size > 1) multiStoreProductCount++;
  }

  console.log(`Verified Multi-Store Variants: ${multiStoreVariants.length}`);
  console.log(`Verified Multi-Store Products: ${multiStoreProductCount}\n`);

  for (const [idx, mv] of multiStoreVariants.entries()) {
    console.log(`[Match #${idx + 1}] ${mv.productName}`);
    console.log(`  Variant ID: ${mv.variantId}`);
    console.log(`  Specs: RAM=${mv.ramGb || 'N/A'}GB, Storage=${mv.storageGb || 'N/A'}GB, Color=${mv.color || 'N/A'}`);
    console.log(`  Store Pairs: [${mv.stores.join(', ')}]`);
    console.log(`  Store Prices:`, mv.prices);
    console.log(`  Store Identifiers:`, mv.identifiers);
    console.log('');
  }
}

main().catch(console.error);
