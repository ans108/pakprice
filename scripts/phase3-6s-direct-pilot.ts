/**
 * Increment 6S — Direct Connector Discovery Benchmark
 *
 * Runs the existing native CrossStoreBackfillService (direct Cheerio/fetch connectors)
 * against the 20 products in scripts/pilot-6s-20products.json.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { CrossStoreBackfillService, BackfillOptions } from '../apps/scraper/src/services/CrossStoreBackfillService';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6S: DIRECT CONNECTOR DISCOVERY BENCHMARK (20 PRODUCTS)');
  console.log('════════════════════════════════════════════════════════════════');

  const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-6s-20products.json');
  const pilot = JSON.parse(fs.readFileSync(pilotPath, 'utf-8'));
  const pilotIds = pilot.map((p: any) => p.id);

  console.log(`Loaded ${pilot.length} products from ${path.basename(pilotPath)}`);

  const checkpointFile = path.resolve(process.cwd(), 'scripts/backfill_checkpoint_6s_direct.json');
  if (fs.existsSync(checkpointFile)) {
    fs.unlinkSync(checkpointFile);
  }

  const options: BackfillOptions = {
    apply: false,
    stores: ['telemart', 'priceoye', 'shophive', 'mega-pk'],
    batchSize: 20,
    offset: 0,
    rateLimitMs: 1500,
    concurrency: 1,
    timeoutMs: 15000,
    checkpointFile,
    onlyTelemartSingleStore: false,
    productIds: pilotIds,
  };

  const service = new CrossStoreBackfillService();
  const summary = await service.runBackfill(options);

  const reportPath = path.resolve(process.cwd(), `scripts/backfill_report_6s_direct_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  DIRECT CONNECTOR BENCHMARK COMPLETE');
  console.log(`  Canonical Audited     : ${summary.totalCanonicalAudited}`);
  console.log(`  Candidates Found      : ${summary.candidatesFound}`);
  console.log(`  PDPs Parsed           : ${summary.pdpsParsed}`);
  console.log(`  Safe Matches          : ${summary.safeCanonicalMatches}`);
  console.log(`  Duration              : ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log('  Outcomes Breakdown:');
  for (const [k, v] of Object.entries(summary.outcomes)) {
    if (v > 0) console.log(`    - ${k}: ${v}`);
  }
  console.log(`  Report saved to: ${path.basename(reportPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
