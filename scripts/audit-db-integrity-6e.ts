import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runAudit(): Promise<void> {
  console.log("====================================================");
  console.log("  INCREMENT 6E: FINAL DATABASE INTEGRITY AUDIT");
  console.log("====================================================\n");

  // 1. Basic counts
  const { count: totalProducts } = await db.from("products").select("*", { count: "exact", head: true });
  const { count: totalVariants } = await db.from("product_variants").select("*", { count: "exact", head: true });
  const { count: totalPrices } = await db.from("prices").select("*", { count: "exact", head: true });
  const { count: totalPriceHistory } = await db.from("price_history").select("*", { count: "exact", head: true });
  const { count: totalIdentifiers } = await db.from("store_product_identifiers").select("*", { count: "exact", head: true });

  console.log(`[Counts] Products: ${totalProducts}`);
  console.log(`[Counts] Product Variants: ${totalVariants}`);
  console.log(`[Counts] Current Prices: ${totalPrices}`);
  console.log(`[Counts] Price History Entries: ${totalPriceHistory}`);
  console.log(`[Counts] Store Identifiers: ${totalIdentifiers}\n`);

  // 2. Duplicate current prices check: (variant_id, store_id)
  const { data: allPrices } = await db.from("prices").select("id, variant_id, store_id");
  const priceKeyCount = new Map<string, number>();
  let duplicateCurrentPrices = 0;
  for (const p of allPrices || []) {
    const key = `${p.variant_id}:${p.store_id}`;
    const count = (priceKeyCount.get(key) || 0) + 1;
    priceKeyCount.set(key, count);
    if (count === 2) {
      duplicateCurrentPrices++;
      console.error(`Duplicate current price found for variant_id=${p.variant_id}, store_id=${p.store_id}`);
    }
  }
  console.log(`[Integrity] Duplicate (variant_id, store_id) in prices: ${duplicateCurrentPrices}`);

  // 3. Multi-store variants
  const variantStoreMap = new Map<string, Set<string>>();
  for (const p of allPrices || []) {
    if (!variantStoreMap.has(p.variant_id)) {
      variantStoreMap.set(p.variant_id, new Set());
    }
    variantStoreMap.get(p.variant_id)!.add(p.store_id);
  }

  const multiStoreVariantIds: string[] = [];
  for (const [vId, stores] of variantStoreMap.entries()) {
    if (stores.size > 1) {
      multiStoreVariantIds.push(vId);
    }
  }

  console.log(`[Multi-Store Variants] Total verified: ${multiStoreVariantIds.length} (Phase 0 Baseline: 7, Target: >7)\n`);

  // Fetch store names
  const { data: storesData } = await db.from("stores").select("id, name, slug");
  const storeMap = new Map(storesData?.map(s => [s.id, s]) || []);

  // Fetch variant and product details for multi-store variants
  const { data: variantsData, error: vErr } = await db
    .from("product_variants")
    .select("id, name, product_id, ram_gb, storage_gb, color, model_number")
    .in("id", multiStoreVariantIds);
  if (vErr) throw vErr;

  const productIds = [...new Set(variantsData?.map(v => v.product_id) || [])];
  const { data: productsData, error: pErr } = await db
    .from("products")
    .select("id, name, slug")
    .in("id", productIds);
  if (pErr) throw pErr;

  const prodMap = new Map(productsData?.map(p => [p.id, p]) || []);

  // Store Pair Overlap counts
  const pairCounts = new Map<string, number>();
  for (const vId of multiStoreVariantIds) {
    const storeIds = Array.from(variantStoreMap.get(vId) || []).sort();
    for (let i = 0; i < storeIds.length; i++) {
      for (let j = i + 1; j < storeIds.length; j++) {
        const s1 = storeMap.get(storeIds[i])?.slug || storeIds[i];
        const s2 = storeMap.get(storeIds[j])?.slug || storeIds[j];
        const pairKey = `${s1} ↔ ${s2}`;
        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }
    }
  }

  console.log("[Store Pair Overlap Matrix]:");
  for (const [pair, count] of pairCounts.entries()) {
    console.log(`  - ${pair}: ${count} shared variants`);
  }

  console.log("\n[Verified Multi-Store Variants Detail]:");
  for (const [idx, v] of (variantsData || []).entries()) {
    const prod = prodMap.get(v.product_id);
    const stores = Array.from(variantStoreMap.get(v.id) || []).map(sId => storeMap.get(sId)?.name || sId);
    console.log(`  ${idx + 1}. [${prod?.name}] (slug: ${prod?.slug})`);
    console.log(`     Variant ID: ${v.id} | Name: ${v.name}`);
    console.log(`     Stores (${stores.length}): ${stores.join(", ")}`);
  }

  // 4. Orphan checks
  const { data: allVariants } = await db.from("product_variants").select("id");
  const variantIdSet = new Set(allVariants?.map(v => v.id) || []);
  let orphanedPrices = 0;
  for (const p of allPrices || []) {
    if (!variantIdSet.has(p.variant_id)) {
      orphanedPrices++;
    }
  }
  console.log(`\n[Integrity] Orphaned prices: ${orphanedPrices}`);

  const hasMegaOverlap = Array.from(pairCounts.keys()).some(k => k.includes("mega"));
  const allPassed =
    duplicateCurrentPrices === 0 &&
    orphanedPrices === 0 &&
    multiStoreVariantIds.length > 7 &&
    hasMegaOverlap;

  console.log("\n====================================================");
  if (allPassed) {
    console.log("  AUDIT RESULT: PASSED ALL INTEGRITY CHECKS! ✅");
  } else {
    console.error("  AUDIT RESULT: FAILED CHECKS! ❌");
  }
  console.log("====================================================\n");
}

runAudit().catch(console.error);
