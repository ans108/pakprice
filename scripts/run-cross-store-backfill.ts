import dotenv from 'dotenv';
import path from 'path';
import { CrossStoreBackfillService, BackfillOptions } from '../apps/scraper/src/services/CrossStoreBackfillService';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);

  const apply = args.includes('--apply');
  const onlyTelemartSingleStore = !args.includes('--all-catalog');

  let batchSize = 20;
  const batchArg = args.find(a => a.startsWith('--batch-size='));
  if (batchArg) {
    batchSize = parseInt(batchArg.split('=')[1], 10) || 20;
  }

  let offset = 0;
  const offsetArg = args.find(a => a.startsWith('--offset='));
  if (offsetArg) {
    offset = parseInt(offsetArg.split('=')[1], 10) || 0;
  }

  let stores = ['shophive', 'priceoye'];
  const storesArg = args.find(a => a.startsWith('--stores='));
  if (storesArg) {
    stores = storesArg.split('=')[1].replace(/"/g, '').split(/[\s,]+/).filter(Boolean).map(s => s.trim().toLowerCase());
  }

  let rateLimitMs = 1500;
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit-ms='));
  if (rateLimitArg) {
    rateLimitMs = parseInt(rateLimitArg.split('=')[1], 10) || 1500;
  }

  let categories: string[] | undefined;
  const catArg = args.find(a => a.startsWith('--categories='));
  if (catArg) {
    categories = catArg.split('=')[1].split(',').map(c => c.trim().toLowerCase());
  }

  let productIds: string[] | undefined;
  if (args.includes('--pilot')) {
    const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-20-telemart-electronics.json');
    if (require('fs').existsSync(pilotPath)) {
      const pilotData = JSON.parse(require('fs').readFileSync(pilotPath, 'utf8'));
      productIds = pilotData.map((p: any) => p.id);
      batchSize = productIds.length;
    }
  }

  const checkpointFile = path.resolve(process.cwd(), 'scripts/backfill_checkpoint.json');

  return {
    apply,
    stores,
    batchSize,
    offset,
    rateLimitMs,
    concurrency: 1,
    timeoutMs: 15000,
    checkpointFile,
    onlyTelemartSingleStore,
    categories,
    productIds,
  };
}

async function main() {
  const options = parseArgs();

  console.log('================================================================');
  console.log('       PAKPRICE OPERATOR CROSS-STORE BACKFILL RUNNER            ');
  console.log('================================================================');
  console.log(`Mode:            ${options.apply ? '🔴 APPLY (COMMITTING WRITES)' : '🟢 DRY-RUN (READ-ONLY SIMULATION)'}`);
  console.log(`Target Stores:   ${options.stores.join(', ')}`);
  console.log(`Batch Size:      ${options.batchSize}`);
  console.log(`Offset:          ${options.offset}`);
  console.log(`Rate Limit:      ${options.rateLimitMs} ms per request`);
  console.log(`Filter:          ${options.onlyTelemartSingleStore ? 'Telemart-only canonical products' : 'All canonical products'}`);
  console.log(`Checkpoint File: ${options.checkpointFile}`);
  console.log('================================================================\n');

  if (!options.apply) {
    console.log('ℹ️  Running in safe DRY-RUN mode. No changes will be written to Supabase.');
    console.log('ℹ️  To execute writes after inspection, rerun with the explicit flag: --apply\n');
  } else {
    console.log('⚠️  APPLY MODE ACTIVATED: Live verified offers will be persisted to Supabase.\n');
  }

  const service = new CrossStoreBackfillService();
  const summary = await service.runBackfill(options);

  console.log('\n================================================================');
  console.log('                  BACKFILL AUDIT SUMMARY REPORT                 ');
  console.log('================================================================');
  console.log(`Total Canonical Products Audited:  ${summary.totalCanonicalAudited}`);
  console.log(`Candidates Discovered:             ${summary.candidatesFound}`);
  console.log(`PDPs Fetched & Parsed:             ${summary.pdpsParsed}`);
  console.log(`Safe Canonical Matches:            ${summary.safeCanonicalMatches}`);
  console.log(`Offers Persisted:                  ${summary.offersPersisted}`);
  console.log(`Duration:                          ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log('----------------------------------------------------------------');
  console.log('Outcome Breakdown:');
  for (const [outcome, count] of Object.entries(summary.outcomes)) {
    if (count > 0) {
      console.log(`  - ${outcome.padEnd(25)}: ${count}`);
    }
  }
  console.log('================================================================\n');

  if (summary.records.length > 0) {
    console.log('Detailed Records Sample (first 25):');
    console.log('| Outcome | Store | Product | Price | Method | Confidence |');
    console.log('|---|---|---|---|---|---|');
    summary.records.slice(0, 25).forEach(r => {
      console.log(
        `| ${r.outcome} | ${r.storeSlug} | ${r.productName.slice(0, 30)} | Rs. ${r.price || '-'} | ${r.matchMethod || '-'} | ${r.confidence?.toFixed(2) || '-'} |`
      );
    });
  }

  // Save full run report
  const reportPath = path.resolve(
    process.cwd(),
    `scripts/backfill_report_${options.apply ? 'apply' : 'dryrun'}_${Date.now()}.json`
  );
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Complete auditable audit log saved to: ${reportPath}`);
}

main().catch(err => {
  console.error('\n❌ Backfill execution failed:', err);
  process.exit(1);
});
