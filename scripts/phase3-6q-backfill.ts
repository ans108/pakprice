/**
 * Phase 3 — Cross-Store Discovery & Backfill Runner (Increment 6Q)
 *
 * Runs CrossStoreBackfillService against the balanced 50-product Wave 2 pilot
 * saved in scripts/pilot-50-6q.json.
 *
 * Usage:
 *   npx tsx scripts/phase3-6q-backfill.ts                         # DRY-RUN (safe, all 4 stores)
 *   npx tsx scripts/phase3-6q-backfill.ts --stores=telemart,shophive,priceoye,mega-pk
 *   npx tsx scripts/phase3-6q-backfill.ts --apply --approved-only # Phase 4 Apply
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

  // Default target stores
  let stores = ['telemart', 'shophive', 'priceoye', 'mega-pk'];
  const storesArg = args.find(a => a.startsWith('--stores='));
  if (storesArg) {
    const rawStores = storesArg.replace(/^--stores=/, '');
    stores = rawStores.replace(/["']/g, '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  let batchSize = 50;
  const bsArg = args.find(a => a.startsWith('--batch-size='));
  if (bsArg) batchSize = parseInt(bsArg.split('=')[1], 10) || 50;

  let rateLimitMs = 2000;
  const rlArg = args.find(a => a.startsWith('--rate-limit-ms='));
  if (rlArg) rateLimitMs = parseInt(rlArg.split('=')[1], 10) || 2000;

  const approvedOnly = args.includes('--approved-only');
  let explicitSlugs: string[] | undefined;
  const slugsArg = args.find(a => a.startsWith('--slugs='));
  if (slugsArg) {
    explicitSlugs = slugsArg.replace(/^--slugs=/, '').replace(/["']/g, '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  }

  return { apply, stores, batchSize, rateLimitMs, approvedOnly, explicitSlugs };
}

async function resolvePilotIds(approvedOnly: boolean, explicitSlugs?: string[]): Promise<string[]> {
  let slugs: string[] = [];
  if (explicitSlugs && explicitSlugs.length > 0) {
    slugs = explicitSlugs;
    console.log(`  Targeting ${slugs.length} explicit slugs`);
  } else if (approvedOnly) {
    const approvedFile = path.resolve(process.cwd(), 'scripts/approved_candidates_6q.json');
    if (fs.existsSync(approvedFile)) {
      const approved: Array<{ slug: string }> = JSON.parse(fs.readFileSync(approvedFile, 'utf8'));
      slugs = approved.map(p => p.slug);
      console.log(`  Targeting ${slugs.length} approved Wave 2 pilot slugs from approved_candidates_6q.json`);
    } else {
      throw new Error('approved_candidates_6q.json not found — validate candidates before applying');
    }
  } else {
    const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-50-6q.json');
    if (!fs.existsSync(pilotPath)) {
      throw new Error('pilot-50-6q.json not found — run build-6q-pilot.ts first');
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
    console.warn(`  ⚠ ${missing.length} pilot slugs not found in DB:`, missing);
  }
  console.log(`  ✓ Resolved ${found.length}/${slugs.length} slugs to UUIDs`);
  return found.map(p => p.id);
}

async function main() {
  const { apply, stores, batchSize, rateLimitMs, approvedOnly, explicitSlugs } = parseArgs();

  console.log('═'.repeat(64));
  console.log('  PHASE 3 — CROSS-STORE DISCOVERY & BACKFILL (Increment 6Q)');
  console.log('═'.repeat(64));
  console.log(`  Mode:          ${apply ? '🔴 APPLY — WRITING TO DATABASE' : '🟢 DRY-RUN — READ-ONLY'}`);
  console.log(`  Scope:         ${approvedOnly ? 'Approved Candidates Only' : 'Full 50-Product Wave 2 Pilot'}`);
  console.log(`  Stores:        ${stores.join(', ')}`);
  console.log(`  Batch size:    ${batchSize}`);
  console.log(`  Rate limit:    ${rateLimitMs}ms per request`);
  console.log(`  Time:          ${new Date().toISOString()}`);
  console.log('═'.repeat(64) + '\n');

  if (!apply) {
    console.log('  ℹ  Running in safe DRY-RUN mode. No changes will be written.');
    console.log('  ℹ  Validate report and rerun with --apply to commit to Supabase.\n');
  } else {
    console.log('  ⚠  APPLY MODE: Verified offers will be written to Supabase.\n');
  }

  const productIds = await resolvePilotIds(approvedOnly, explicitSlugs);
  if (productIds.length === 0) {
    console.error('No pilot products resolved — aborting.');
    process.exit(1);
  }

  for (const s of stores) {
    if (s.includes(' ')) {
      console.error(`\n❌ Store slug "${s}" contains a space. Aborting.`);
      process.exit(1);
    }
  }
  console.log(`  ✓ Target stores validated: ${stores.join(', ')}\n`);

  const checkpointSuffix = apply ? 'apply' : 'dryrun';
  const checkpointFile = path.resolve(process.cwd(), `scripts/backfill_checkpoint_6q_${checkpointSuffix}.json`);
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

  const service = new CrossStoreBackfillService();
  const summary = await service.runBackfill(options);

  // Print summary
  console.log('\n' + '═'.repeat(64));
  console.log('  PHASE 3 RESULTS SUMMARY (Increment 6Q)');
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

  const accepted = summary.records.filter(r =>
    r.outcome === 'found_and_matched' || r.outcome === 'offer_persisted'
  );
  if (accepted.length > 0) {
    console.log(`\n  ✓ Accepted matches (${accepted.length}):`);
    console.log(`  ${'product'.padEnd(44)} ${'store'.padEnd(12)} ${'price'.padEnd(12)} ${'method'.padEnd(18)} conf`);
    for (const m of accepted) {
      const title = (m.candidateTitle || m.productName).substring(0, 42);
      const store = m.storeSlug.padEnd(12);
      const price = `Rs.${m.price}`.padEnd(12);
      const method = (m.matchMethod || 'unknown').padEnd(18);
      const conf = m.confidence !== undefined ? m.confidence.toFixed(2) : '—';
      console.log(`  ${title.padEnd(44)} ${store} ${price} ${method} ${conf}`);
    }
  }

  const reportFile = path.resolve(
    process.cwd(),
    `scripts/backfill_report_6q_${apply ? 'apply' : 'dryrun'}_${Date.now()}.json`
  );
  fs.writeFileSync(reportFile, JSON.stringify(summary, null, 2));
  console.log(`\n  📄 Full audit log saved to: ${path.basename(reportFile)}`);
  console.log('\n' + '═'.repeat(64));
}

main().catch(console.error);
