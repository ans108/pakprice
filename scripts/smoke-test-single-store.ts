/**
 * scripts/smoke-test-single-store.ts
 *
 * OPERATOR-GATED one-store smoke test for scheduler validation (Phase 12).
 *
 * DEFAULT: DISABLED — requires explicit environment configuration to execute.
 *
 * Required environment variables:
 *   SMOKE_TEST_ENABLED=true        — explicit operator approval
 *   SMOKE_TEST_STORE=<slug>        — production store slug (priceoye|telemart|mega-pk|shophive)
 *   SMOKE_TEST_JOB_TYPE=<type>     — discovery or refresh
 *
 * Optional:
 *   SMOKE_TEST_LIMIT=10            — max URLs for refresh / max products for discovery (default: 10)
 *   SCRAPER_DRY_RUN=true           — dry run mode (default from config)
 *
 * SAFETY GUARANTEES:
 * - Respects existing job protections (DB unique constraint)
 * - Respects allowCreate rules (refresh → allowCreate: false)
 * - Respects domain/redirect validation
 * - Creates a normal auditable scrape_jobs record
 * - Does NOT bypass scheduler safeguards
 * - Does NOT launch a full catalog crawl (capped at SMOKE_TEST_LIMIT)
 * - Does NOT auto-execute during build/test/verification
 *
 * Usage:
 *   SMOKE_TEST_ENABLED=true SMOKE_TEST_STORE=priceoye SMOKE_TEST_JOB_TYPE=refresh npx tsx scripts/smoke-test-single-store.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

import { ScraperService } from '../apps/scraper/src/services/ScraperService';
import { scraperConfig } from '../apps/scraper/src/config/scraperConfig';

const VALID_STORES = ['priceoye', 'telemart', 'mega-pk', 'shophive'];
const VALID_JOB_TYPES = ['discovery', 'refresh'];

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  OPERATOR-GATED SMOKE TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check explicit operator approval
  if (process.env.SMOKE_TEST_ENABLED !== 'true') {
    console.log('SMOKE TEST IS DISABLED (default safe behavior).');
    console.log('');
    console.log('To enable, set the following environment variables:');
    console.log('  SMOKE_TEST_ENABLED=true');
    console.log('  SMOKE_TEST_STORE=priceoye|telemart|mega-pk|shophive');
    console.log('  SMOKE_TEST_JOB_TYPE=discovery|refresh');
    console.log('  SMOKE_TEST_LIMIT=10  (optional, default 10)');
    console.log('');
    console.log('Example:');
    console.log('  SMOKE_TEST_ENABLED=true SMOKE_TEST_STORE=priceoye SMOKE_TEST_JOB_TYPE=refresh npx tsx scripts/smoke-test-single-store.ts');
    process.exit(0);
  }

  // 2. Validate store
  const store = process.env.SMOKE_TEST_STORE;
  if (!store || !VALID_STORES.includes(store)) {
    console.error(`ERROR: Invalid or missing SMOKE_TEST_STORE="${store}".`);
    console.error(`Valid values: ${VALID_STORES.join(', ')}`);
    process.exit(1);
  }

  // 3. Validate job type
  const jobType = process.env.SMOKE_TEST_JOB_TYPE as 'discovery' | 'refresh';
  if (!jobType || !VALID_JOB_TYPES.includes(jobType)) {
    console.error(`ERROR: Invalid or missing SMOKE_TEST_JOB_TYPE="${jobType}".`);
    console.error(`Valid values: ${VALID_JOB_TYPES.join(', ')}`);
    process.exit(1);
  }

  // 4. Parse and validate limit
  const limit = parseInt(process.env.SMOKE_TEST_LIMIT || '10', 10);
  if (isNaN(limit) || limit < 1 || limit > 50) {
    console.error('ERROR: SMOKE_TEST_LIMIT must be between 1 and 50.');
    process.exit(1);
  }

  const dryRun = scraperConfig.dryRun;

  console.log(`  Store:    ${store}`);
  console.log(`  Job Type: ${jobType}`);
  console.log(`  Limit:    ${limit}`);
  console.log(`  Dry Run:  ${dryRun}`);
  console.log('');

  // 5. Execute smoke test
  const scraperService = new ScraperService();

  if (jobType === 'refresh') {
    console.log(`Starting refresh smoke test for ${store} (limit: ${limit})...\n`);
    const result = await scraperService.runRefresh({
      storeKey: store,
      triggeredBy: 'manual',
      dryRun,
      limit,
    });

    console.log('--- Smoke Test Result ---');
    console.log(`  Status:     ${result.status}`);
    console.log(`  Success:    ${result.success}`);
    console.log(`  Discovered: ${result.metrics.discovered}`);
    console.log(`  Scraped:    ${result.metrics.scraped}`);
    console.log(`  Matched:    ${result.metrics.matched}`);
    console.log(`  Updated:    ${result.metrics.updatedPrices}`);
    console.log(`  Rejected:   ${result.metrics.rejected}`);
    console.log(`  Errors:     ${result.metrics.errors}`);
    console.log(`  Duration:   ${result.metrics.durationMs}ms`);
    if (result.error) console.log(`  Error:      ${result.error}`);
    if (result.errorCategory) console.log(`  Error Cat:  ${result.errorCategory}`);
  } else {
    // Discovery mode — cap maxProducts for safety
    process.env.SCRAPER_MAX_PRODUCTS = String(limit);
    console.log(`Starting discovery smoke test for ${store} (maxProducts capped at ${limit})...\n`);

    const result = await scraperService.runStore({
      storeKey: store,
      triggeredBy: 'manual',
      dryRun,
    });

    console.log('--- Smoke Test Result ---');
    console.log(`  Status:       ${result.status}`);
    console.log(`  Success:      ${result.success}`);
    console.log(`  Discovered:   ${result.metrics.discovered}`);
    console.log(`  New Products: ${result.metrics.newProducts}`);
    console.log(`  New Variants: ${result.metrics.newVariants}`);
    console.log(`  Updated:      ${result.metrics.updatedPrices}`);
    console.log(`  Rejected:     ${result.metrics.rejected}`);
    console.log(`  Errors:       ${result.metrics.errors}`);
    console.log(`  Duration:     ${result.metrics.durationMs}ms`);
    if (result.error) console.log(`  Error:        ${result.error}`);
    if (result.errorCategory) console.log(`  Error Cat:    ${result.errorCategory}`);
  }

  console.log('\nSmoke test completed. Check scrape_jobs table for the auditable job record.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal smoke test error:', err);
  process.exit(1);
});
