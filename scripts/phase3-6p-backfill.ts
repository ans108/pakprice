/**
 * Phase 3 — Cross-Store Discovery and Backfill (Increment 6P)
 *
 * Runs the CrossStoreBackfillService against the 49-product pilot set
 * saved in scripts/pilot-50-6p.json.
 *
 * Step 1: Resolve pilot slugs → product UUIDs from the live DB
 * Step 2: DRY-RUN mode — prints what would be written, zero DB writes
 * Step 3: APPLY mode — write verified offers to DB (pass --apply flag)
 *
 * Usage:
 *   npx tsx scripts/phase3-6p-backfill.ts              # DRY-RUN (safe)
 *   npx tsx scripts/phase3-6p-backfill.ts --apply      # APPLY (writes to DB)
 *   npx tsx scripts/phase3-6p-backfill.ts --stores=telemart,mega-pk
 *   npx tsx scripts/phase3-6p-backfill.ts --batch-size=10 --apply
 *   npx tsx scripts/phase3-6p-backfill.ts --stores=telemart,mega-pk,shophive --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { CrossStoreBackfillService, BackfillOptions } from '../apps/scraper/src/services/CrossStoreBackfillService';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  // Default: check all three secondary stores (priceoye excluded — it's the source)
  let stores = ['telemart', 'mega-pk', 'shophive'];
  const storesArg = args.find(a => a.startsWith('--stores='));
  if (storesArg) {
    // Robust split: handle both comma and semicolon separators, strip quotes
    const rawStores = storesArg.replace(/^--stores=/, '');
    stores = rawStores.replace(/["']/g, '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  let batchSize = 49; // full pilot set
  const bsArg = args.find(a => a.startsWith('--batch-size='));
  if (bsArg) batchSize = parseInt(bsArg.split('=')[1], 10) || 49;

  let rateLimitMs = 2000;
  const rlArg = args.find(a => a.startsWith('--rate-limit-ms='));
  if (rlArg) rateLimitMs = parseInt(rlArg.split('=')[1], 10) || 2000;

  const approvedOnly = args.includes('--approved-only');
  let explicitSlugs: string[] | undefined;
  const slugsArg = args.find(a => a.startsWith('--slugs='));
  if (slugsArg) {
    explicitSlugs = slugsArg.replace(/^--slugs=/, '').replace(/["']/g, '').split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }

  return { apply, stores, batchSize, rateLimitMs, approvedOnly, explicitSlugs };
}

async function resolvePilotIds(approvedOnly: boolean, explicitSlugs?: string[]): Promise<string[]> {
  let slugs: string[] = [];
  if (explicitSlugs && explicitSlugs.length > 0) {
    slugs = explicitSlugs;
    console.log(`  Targeting ${slugs.length} explicit slugs:`, slugs);
  } else if (approvedOnly) {
    slugs = [
      'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
      'unknown-infinix-xw3gt-smart-watch',
      'unknown-zero-ignite-smart-watch',
      'unknown-zero-luna-smart-watch',
      'unknown-zero-visionary-smartwatch',
    ];
    console.log(`  Targeting ${slugs.length} verified/approved pilot slugs`);
  } else {
    const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-50-6p.json');
    if (!fs.existsSync(pilotPath)) {
      throw new Error('pilot-50-6p.json not found — run phase0-6p-baseline.ts first');
    }
    const pilot: Array<{ slug: string; name: string }> = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));
    slugs = pilot.map(p => p.slug);
  }

  console.log(`  Resolving ${slugs.length} pilot slugs to product UUIDs...`);

  const { data: products, error } = await supabase
    .from('products')
    .select('id, slug')
    .in('slug', slugs);

  if (error) throw error;

  const found = products ?? [];
  const foundSlugs = new Set(found.map(p => p.slug));
  const missing = slugs.filter(s => !foundSlugs.has(s));
  if (missing.length > 0) {
    console.warn(`  ⚠ ${missing.length} pilot slugs not found in DB:`);
    missing.forEach(s => console.warn(`    - ${s}`));
  }
  console.log(`  ✓ Resolved ${found.length}/${slugs.length} slugs to UUIDs`);
  return found.map(p => p.id);
}

async function main() {
  const { apply, stores, batchSize, rateLimitMs, approvedOnly, explicitSlugs } = parseArgs();

  console.log('═'.repeat(64));
  console.log('  PHASE 3 — CROSS-STORE BACKFILL (Increment 6P)');
  console.log('═'.repeat(64));
  console.log(`  Mode:          ${apply ? '🔴 APPLY — WRITING TO DATABASE' : '🟢 DRY-RUN — READ-ONLY'}`);
  console.log(`  Scope:         ${approvedOnly ? 'Verified Approved Candidates Only (5 products)' : 'Full Pilot Set'}`);
  console.log(`  Stores:        ${stores.join(', ')}`);
  console.log(`  Batch size:    ${batchSize}`);
  console.log(`  Rate limit:    ${rateLimitMs}ms per request`);
  console.log(`  Time:          ${new Date().toISOString()}`);
  console.log('═'.repeat(64) + '\n');

  if (!apply) {
    console.log('  ℹ  Running in safe DRY-RUN mode. No changes will be written.');
    console.log('  ℹ  Re-run with --apply to commit accepted offers to Supabase.\n');
  } else {
    console.log('  ⚠  APPLY MODE: Verified offers will be written to Supabase.\n');
  }

  // Step 1: Resolve slugs to IDs
  const productIds = await resolvePilotIds(approvedOnly, explicitSlugs);
  if (productIds.length === 0) {
    console.error('No pilot products resolved — aborting.');
    process.exit(1);
  }

  // Validate that stores are individually named (guard against shell quoting issues)
  for (const s of stores) {
    if (s.includes(' ')) {
      console.error(`\n❌ Store slug "${s}" contains a space — parsing error. Aborting.`);
      process.exit(1);
    }
  }
  console.log(`  ✓ Target stores validated: ${stores.join(', ')}\n`);

  // Step 2: Clear checkpoint for a fresh run
  const checkpointSuffix = apply ? 'apply' : 'dryrun';
  const checkpointFile = path.resolve(process.cwd(), `scripts/backfill_checkpoint_6p_${checkpointSuffix}.json`);
  if (fs.existsSync(checkpointFile)) {
    fs.unlinkSync(checkpointFile);
    console.log(`  ✓ Checkpoint (${checkpointSuffix}) cleared for fresh run\n`);
  }

  const options: BackfillOptions = {
    apply,
    stores,
    batchSize,
    offset: 0,
    rateLimitMs,
    concurrency: 1,
    timeoutMs: 20000,
    checkpointFile,
    onlyTelemartSingleStore: false,
    productIds,
  };

  // Step 3: Run
  const service = new CrossStoreBackfillService();
  const summary = await service.runBackfill(options);

  // ── Print summary ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log('  PHASE 3 RESULTS SUMMARY');
  console.log('═'.repeat(64));
  console.log(`  Canonical products audited : ${summary.totalCanonicalAudited}`);
  console.log(`  Candidates discovered      : ${summary.candidatesFound}`);
  console.log(`  PDPs fetched & parsed      : ${summary.pdpsParsed}`);
  console.log(`  Safe canonical matches     : ${summary.safeCanonicalMatches}`);
  console.log(`  Offers persisted           : ${summary.offersPersisted}`);
  console.log(`  Duration                   : ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log('\n  Outcome breakdown:');
  for (const [outcome, count] of Object.entries(summary.outcomes)) {
    if (count > 0) {
      const bar = '█'.repeat(Math.min(count, 20));
      console.log(`    ${outcome.padEnd(28)} ${String(count).padStart(4)}  ${bar}`);
    }
  }

  // Per-store breakdown from records
  const storeBreakdown: Record<string, Record<string, number>> = {};
  for (const r of summary.records) {
    if (!storeBreakdown[r.storeSlug]) storeBreakdown[r.storeSlug] = {};
    storeBreakdown[r.storeSlug][r.outcome] = (storeBreakdown[r.storeSlug][r.outcome] || 0) + 1;
  }
  console.log('\n  Per-store breakdown:');
  for (const [store, counts] of Object.entries(storeBreakdown)) {
    const parts = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`    ${store.padEnd(20)} ${parts}`);
  }

  // Accepted matches table
  const accepted = summary.records.filter(r =>
    r.outcome === 'found_and_matched' || r.outcome === 'offer_persisted'
  );
  if (accepted.length > 0) {
    console.log(`\n  ✓ Accepted matches (${accepted.length}):`);
    console.log(`  ${'product'.padEnd(44)} ${'store'.padEnd(12)} ${'price'.padEnd(12)} ${'method'.padEnd(18)} ${'conf'}`);
    for (const r of accepted) {
      const name = r.productName.slice(0, 42);
      console.log(`  ${name.padEnd(44)} ${r.storeSlug.padEnd(12)} Rs.${String(r.price ?? '-').padEnd(10)} ${(r.matchMethod ?? '-').padEnd(18)} ${r.confidence?.toFixed(2) ?? '-'}`);
    }
  }

  // Rejected / failures
  const rejected = summary.records.filter(r =>
    r.outcome === 'no_match' && r.reason
  );
  if (rejected.length > 0 && rejected.length <= 30) {
    console.log(`\n  ✗ No-match rejections (${rejected.length}):`);
    for (const r of rejected.slice(0, 20)) {
      console.log(`    [${r.storeSlug}] ${r.productName.slice(0, 40)} → ${r.reason?.slice(0, 80)}`);
    }
  }

  // Save report
  const mode = apply ? 'apply' : 'dryrun';
  const reportPath = path.resolve(process.cwd(), `scripts/backfill_report_6p_${mode}_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\n  📄 Full audit log saved to: ${path.basename(reportPath)}`);

  // Post-backfill counts (for Phase 5)
  if (apply) {
    console.log('\n  Querying post-backfill counts for Phase 5 delta...');
    const [{ count: prices }, { count: history }] = await Promise.all([
      supabase.from('prices').select('*', { count: 'exact', head: true }),
      supabase.from('price_history').select('*', { count: 'exact', head: true }),
    ]);
    console.log(`  Post-backfill prices      : ${prices}`);
    console.log(`  Post-backfill history     : ${history}`);
    console.log(`  Δ prices (was 849)        : ${(prices ?? 0) - 849}`);
    console.log(`  Δ history (was 1118)      : ${(history ?? 0) - 1118}`);
  }

  console.log('\n' + '═'.repeat(64));
  console.log(apply ? '  ✅ Phase 3 Apply complete.' : '  ✅ Phase 3 Dry-run complete. No DB changes made.');
  console.log('═'.repeat(64) + '\n');
}

main().catch(err => {
  console.error('\n❌ Phase 3 backfill failed:', err.message);
  process.exit(1);
});
