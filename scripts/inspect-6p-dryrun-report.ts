/**
 * Increment 6P — Comprehensive Match Validation & Dry-Run Inspector
 *
 * Inspects backfill_report_6p_dryrun_1792861713556.json and checks:
 * 1. Summary metrics and outcome breakdowns
 * 2. Every single candidate in acceptedMatches and across all records
 * 3. Compares candidates against live Supabase database:
 *    - Canonical product, variant, title, brand, specs
 *    - Existing prices for (variant_id, store_id)
 *    - Candidate URL, price, availability, store identity
 *    - Match strategy and confidence
 * 4. Investigates why log showed fuzzy matches for REVVL TAB, Watch 9, etc., and where they went
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const reportPath = path.resolve(process.cwd(), 'scripts/backfill_report_6p_dryrun_1792861713556.json');
  if (!fs.existsSync(reportPath)) {
    console.error('Report file not found:', reportPath);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  console.log('════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6P DRY-RUN REPORT DETAILED INSPECTION');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('Timestamp:', report.timestamp);
  console.log('Summary:', JSON.stringify(report.summary, null, 2));

  // Count outcomes
  const outcomeCounts: Record<string, number> = {};
  const storeOutcomeCounts: Record<string, Record<string, number>> = {};
  for (const r of report.records || []) {
    outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1;
    if (!storeOutcomeCounts[r.storeSlug]) storeOutcomeCounts[r.storeSlug] = {};
    storeOutcomeCounts[r.storeSlug][r.outcome] = (storeOutcomeCounts[r.storeSlug][r.outcome] || 0) + 1;
  }

  console.log('\n--- Outcome Breakdown ---');
  console.log(JSON.stringify(outcomeCounts, null, 2));

  console.log('\n--- Per-Store Outcome Breakdown ---');
  console.log(JSON.stringify(storeOutcomeCounts, null, 2));

  console.log('\n--- Accepted Matches in Report Header (length:', (report.acceptedMatches || []).length, ') ---');
  console.log(JSON.stringify(report.acceptedMatches, null, 2));

  // Find all records where outcome === 'found_and_matched' or has candidate/match info
  const matchedRecords = (report.records || []).filter((r: any) => r.outcome === 'found_and_matched' || r.matchDetails || r.candidate);
  console.log('\n--- All Matched / Candidate Records (count:', matchedRecords.length, ') ---');
  for (const r of matchedRecords) {
    console.log(JSON.stringify(r, null, 2));
  }

  // Load stores from DB
  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.slug, s]));
  const storeIdMap = new Map((stores || []).map(s => [s.id, s]));

  // Now deeply validate each accepted match candidate against Supabase
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  DEEP VALIDATION OF CANDIDATES AGAINST LIVE DB');
  console.log('════════════════════════════════════════════════════════════════');

  for (let i = 0; i < (report.acceptedMatches || []).length; i++) {
    const m = report.acceptedMatches[i];
    console.log(`\n[Candidate ${i + 1}/${report.acceptedMatches.length}]`);
    console.log('  Product Title  :', m.productTitle);
    console.log('  Store Slug     :', m.storeSlug);
    console.log('  Price          :', m.price);
    console.log('  Method / Conf  :', m.matchMethod, '/', m.confidence);
    console.log('  Variant ID     :', m.variantId);
    console.log('  Product ID     :', m.productId);
    console.log('  Source URL     :', m.url);

    // Fetch canonical product & variant from DB
    const { data: variant, error: varErr } = await supabase
      .from('product_variants')
      .select('*, product:products(*)')
      .eq('id', m.variantId)
      .single();

    if (varErr || !variant) {
      console.log('  ❌ Variant not found in DB:', varErr?.message);
      continue;
    }

    console.log('  DB Product Name:', variant.product?.title);
    console.log('  DB Brand       :', variant.product?.brand);
    console.log('  DB Category ID :', variant.product?.category_id);
    console.log('  DB Variant SKU :', variant.sku);
    console.log('  DB Variant Spec:', JSON.stringify(variant.specifications || {}));

    // Check existing prices for this variant
    const { data: existingPrices } = await supabase
      .from('prices')
      .select('*, store:stores(name, slug)')
      .eq('variant_id', m.variantId);

    console.log('  Existing Prices on Variant:');
    for (const ep of existingPrices || []) {
      console.log(`    - Store: ${ep.store?.name} (${ep.store?.slug}), Price: Rs. ${ep.price}, InStock: ${ep.is_available}, URL: ${ep.url}`);
    }

    const store = storeMap.get(m.storeSlug);
    const existingForStore = (existingPrices || []).find(ep => ep.store_id === store?.id);
    if (existingForStore) {
      console.log(`  ⚠️ OFFER ALREADY EXISTS for store ${m.storeSlug} on this variant! (Price: ${existingForStore.price})`);
    } else {
      console.log(`  ✅ NEW OFFER: No existing offer for store ${m.storeSlug} on variant ${m.variantId}`);
    }
  }

  // Also search log file for REVVL TAB, Galaxy Watch, etc., to see why they matched during log but what their final disposition was
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  INVESTIGATING DISPOSITIONS OF ALL 49 PRODUCTS');
  console.log('════════════════════════════════════════════════════════════════');

  // Group records by product
  const byProduct: Record<string, any[]> = {};
  for (const r of report.records || []) {
    const key = r.productTitle || r.productId;
    if (!byProduct[key]) byProduct[key] = [];
    byProduct[key].push(r);
  }

  for (const [prodTitle, recs] of Object.entries(byProduct)) {
    const matched = recs.filter(r => r.outcome === 'found_and_matched');
    if (matched.length > 0) {
      console.log(`\n🟢 "${prodTitle}": ${matched.length} matched offer(s)`);
      for (const m of matched) {
        console.log(`   - Store: ${m.storeSlug}, Price: Rs. ${m.price}, Method: ${m.matchMethod} (${m.confidence}), URL: ${m.url}`);
      }
    }
  }
}

main().catch(console.error);
