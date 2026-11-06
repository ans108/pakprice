import { createClient } from "@supabase/supabase-js";
import { normalizeProductName, calculateStringSimilarity } from "@pakprice/shared";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.join(process.cwd(), "apps/web/.env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== INCREMENT 6E: PHASE 0 — LIVE READ-ONLY BASELINE ===\n");

  // ── SECTION 1: Global Counts ──
  const [{ count: pCount }, { count: vCount }, { count: prCount }, { count: phCount }, { count: spiCount }] = await Promise.all([
    db.from("products").select("*", { count: "exact", head: true }),
    db.from("product_variants").select("*", { count: "exact", head: true }),
    db.from("prices").select("*", { count: "exact", head: true }),
    db.from("price_history").select("*", { count: "exact", head: true }),
    db.from("store_product_identifiers").select("*", { count: "exact", head: true }),
  ]);

  console.log("1. GLOBAL COUNTS");
  console.log(`   Products:              ${pCount}`);
  console.log(`   Variants:              ${vCount}`);
  console.log(`   Prices:                ${prCount}`);
  console.log(`   Price History:         ${phCount}`);
  console.log(`   Store Identifiers:     ${spiCount}`);

  // ── SECTION 2: Store Distribution ──
  const { data: stores } = await db.from("stores").select("id, name, slug, is_active");
  const storeMap = new Map<string, { name: string; slug: string }>();
  for (const s of stores || []) storeMap.set(s.id, { name: s.name, slug: s.slug });

  const { data: allVariants } = await db.from("product_variants").select(`
    id, name, ram_gb, storage_gb, color, model_number, gtin, image_url,
    products ( id, name, slug, normalized_name, brand_id, category_id, image_url,
      categories ( slug ) ),
    prices ( id, store_id, price, in_stock ),
    store_product_identifiers ( id, store_id, identifier, identifier_type )
  `);

  // Per-store statistics
  const storeStats: Record<string, {
    products: Set<string>;
    variants: Set<string>;
    prices: number;
    withImage: number;
    withModel: number;
    withGtin: number;
    withRam: number;
    withStorage: number;
    withIdentifier: number;
    categories: Set<string>;
  }> = {};

  for (const s of stores || []) {
    storeStats[s.slug] = {
      products: new Set(), variants: new Set(), prices: 0,
      withImage: 0, withModel: 0, withGtin: 0, withRam: 0,
      withStorage: 0, withIdentifier: 0, categories: new Set(),
    };
  }

  let zeroStore = 0, oneStore = 0, twoStore = 0, threePlusStore = 0;
  const multiStoreVariants: any[] = [];

  for (const v of allVariants || []) {
    const prod = v.products as any;
    const prices = v.prices || [];
    const identifiers = v.store_product_identifiers || [];
    const distinctStores = new Set(prices.map((p: any) => p.store_id));

    if (distinctStores.size === 0) zeroStore++;
    else if (distinctStores.size === 1) oneStore++;
    else if (distinctStores.size === 2) twoStore++;
    else threePlusStore++;

    if (distinctStores.size >= 2) {
      multiStoreVariants.push({
        variantId: v.id,
        productName: prod?.name,
        stores: Array.from(distinctStores).map(id => storeMap.get(id as string)?.slug || id),
      });
    }

    for (const p of prices) {
      const slug = storeMap.get(p.store_id)?.slug;
      if (!slug || !storeStats[slug]) continue;
      const st = storeStats[slug];
      st.prices++;
      st.variants.add(v.id);
      if (prod?.id) st.products.add(prod.id);
      if (v.image_url || prod?.image_url) st.withImage++;
      if (v.model_number) st.withModel++;
      if (v.gtin) st.withGtin++;
      if (v.ram_gb) st.withRam++;
      if (v.storage_gb) st.withStorage++;
      const cat = prod?.categories?.slug;
      if (cat) st.categories.add(cat);
    }
    for (const iden of identifiers) {
      const slug = storeMap.get(iden.store_id)?.slug;
      if (slug && storeStats[slug]) storeStats[slug].withIdentifier++;
    }
  }

  console.log(`\n2. VARIANT DISTRIBUTION`);
  console.log(`   0-store:               ${zeroStore}`);
  console.log(`   1-store:               ${oneStore}`);
  console.log(`   2-store:               ${twoStore}`);
  console.log(`   3+ store:              ${threePlusStore}`);
  console.log(`   Multi-store total:     ${twoStore + threePlusStore}`);

  console.log(`\n3. PER-STORE STATISTICS`);
  for (const [slug, st] of Object.entries(storeStats)) {
    if (st.prices === 0 && st.products.size === 0) continue;
    console.log(`\n   --- ${slug} ---`);
    console.log(`     Products:            ${st.products.size}`);
    console.log(`     Variants:            ${st.variants.size}`);
    console.log(`     Current Prices:      ${st.prices}`);
    console.log(`     With Image:          ${st.withImage}`);
    console.log(`     With Model Number:   ${st.withModel}`);
    console.log(`     With GTIN:           ${st.withGtin}`);
    console.log(`     With RAM:            ${st.withRam}`);
    console.log(`     With Storage:        ${st.withStorage}`);
    console.log(`     With Store ID:       ${st.withIdentifier}`);
    console.log(`     Categories:          [${Array.from(st.categories).join(", ")}]`);
  }

  // ── SECTION 4: Store-Pair Candidate Analysis ──
  console.log(`\n4. STORE-PAIR CANDIDATE ANALYSIS`);

  // Build per-store product name index
  const storeProducts: Record<string, { prodId: string; varId: string; name: string; normalized: string; model: string | null; gtin: string | null; ram: number | null; storage: number | null; brand: string | null; category: string | null }[]> = {};
  for (const s of stores || []) storeProducts[s.slug] = [];

  for (const v of allVariants || []) {
    const prod = v.products as any;
    const prices = v.prices || [];
    for (const p of prices) {
      const slug = storeMap.get(p.store_id)?.slug;
      if (!slug) continue;
      storeProducts[slug].push({
        prodId: prod?.id,
        varId: v.id,
        name: prod?.name || "",
        normalized: normalizeProductName(prod?.name || ""),
        model: v.model_number || null,
        gtin: v.gtin || null,
        ram: v.ram_gb || null,
        storage: v.storage_gb || null,
        brand: prod?.brand_id || null,
        category: prod?.categories?.slug || null,
      });
    }
  }

  const storeSlugs = ["priceoye", "telemart", "mega-pk", "daraz", "paklap"];
  const pairs: [string, string][] = [];
  for (let i = 0; i < storeSlugs.length; i++) {
    for (let j = i + 1; j < storeSlugs.length; j++) {
      pairs.push([storeSlugs[i], storeSlugs[j]]);
    }
  }

  for (const [storeA, storeB] of pairs) {
    const prodsA = storeProducts[storeA] || [];
    const prodsB = storeProducts[storeB] || [];
    if (prodsA.length === 0 || prodsB.length === 0) {
      console.log(`\n   ${storeA} ↔ ${storeB}: SKIPPED (${prodsA.length} × ${prodsB.length})`);
      continue;
    }

    let verified = 0, strongCandidate = 0, ambiguous = 0, conflict = 0, insufficient = 0;
    const topCandidates: { nameA: string; nameB: string; sim: number; reason: string }[] = [];

    // Check if already matched (same variant)
    const variantStoreMap = new Map<string, Set<string>>();
    for (const v of allVariants || []) {
      const storeSet = new Set((v.prices || []).map((p: any) => storeMap.get(p.store_id)?.slug));
      variantStoreMap.set(v.id, storeSet);
    }

    // Already verified
    for (const [varId, storeSet] of variantStoreMap) {
      if (storeSet.has(storeA) && storeSet.has(storeB)) verified++;
    }

    // Candidate matching
    for (const a of prodsA) {
      // Skip if already verified
      const aStores = variantStoreMap.get(a.varId);
      if (aStores && aStores.has(storeB)) continue;

      let bestSim = 0;
      let bestB: typeof a | null = null;

      for (const b of prodsB) {
        if (a.prodId === b.prodId) continue; // same product already
        const bStores = variantStoreMap.get(b.varId);
        if (bStores && bStores.has(storeA)) continue;

        const sim = calculateStringSimilarity(a.normalized, b.normalized);
        if (sim > bestSim) {
          bestSim = sim;
          bestB = b;
        }
      }

      if (!bestB) continue;

      // Spec conflict check
      const ramConflict = a.ram !== null && bestB.ram !== null && a.ram !== bestB.ram;
      const storageConflict = a.storage !== null && bestB.storage !== null && a.storage !== bestB.storage;

      if (bestSim >= 0.90) {
        if (ramConflict || storageConflict) {
          conflict++;
        } else {
          strongCandidate++;
          if (topCandidates.length < 20) {
            topCandidates.push({
              nameA: a.name, nameB: bestB.name, sim: bestSim,
              reason: ramConflict || storageConflict ? "spec_conflict" : bestSim >= 0.98 ? "near_exact" : "strong",
            });
          }
        }
      } else if (bestSim >= 0.75) {
        ambiguous++;
      } else {
        insufficient++;
      }
    }

    console.log(`\n   ${storeA} ↔ ${storeB}:`);
    console.log(`     Store A products:    ${prodsA.length}`);
    console.log(`     Store B products:    ${prodsB.length}`);
    console.log(`     Verified:            ${verified}`);
    console.log(`     Strong Candidates:   ${strongCandidate}`);
    console.log(`     Ambiguous:           ${ambiguous}`);
    console.log(`     Explicit Conflicts:  ${conflict}`);
    console.log(`     Insufficient Data:   ${insufficient}`);
    if (topCandidates.length > 0) {
      console.log(`     Top Candidates:`);
      for (const c of topCandidates.slice(0, 10)) {
        console.log(`       - "${c.nameA}" ↔ "${c.nameB}" (sim=${c.sim.toFixed(3)}, ${c.reason})`);
      }
    }
  }

  // ── SECTION 5: Category Overlap ──
  console.log(`\n5. CATEGORY OVERLAP`);
  const storeCats: Record<string, Set<string>> = {};
  for (const [slug, st] of Object.entries(storeStats)) {
    if (st.categories.size > 0) storeCats[slug] = st.categories;
  }
  for (const [slug, cats] of Object.entries(storeCats)) {
    console.log(`   ${slug}: [${Array.from(cats).join(", ")}]`);
  }
}

main().catch(console.error);
