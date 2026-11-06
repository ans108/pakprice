import { execSync } from 'child_process';
import path from 'path';

interface SuiteResult {
  name: string;
  command: string;
  passed: number;
  failed: number;
}

const suites = [
  { name: 'normalizeImageUrl', file: 'src/__tests__/normalizeImageUrl.test.ts' },
  { name: 'imageExtraction', file: 'src/__tests__/imageExtraction.dryrun.test.ts' },
  { name: 'price-validation', file: 'tests/price-validation.test.ts' },
  { name: 'storeScrapers', file: 'src/__tests__/storeScrapers.test.ts' },
  // Increment 6I test suites
  { name: 'ingestion-allow-create', file: 'src/__tests__/ingestion-allow-create.test.ts' },
  { name: 'domain-validator', file: 'src/__tests__/domain-validator.test.ts' },
  { name: 'refresh-coverage-policy', file: 'src/__tests__/refresh-coverage-policy.test.ts' },
  { name: 'scheduler', file: 'src/__tests__/scheduler.test.ts' },
  { name: 'db-concurrency-race', file: 'src/__tests__/db-concurrency-race.test.ts' },
  { name: 'redirect-validator', file: 'src/__tests__/redirect-validator.test.ts' },
  { name: 'refresh-candidate-repo', file: 'src/__tests__/refresh-candidate-repo.test.ts' },
  // Increment 6J test suites
  { name: 'activation-modes', file: 'src/__tests__/activation-modes.test.ts' },
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  PAKPRICE SCRAPER FULL REGRESSION SUITE (LOCKED 225 + 6I SUITES)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let totalPassed = 0;
let totalFailed = 0;
const results: SuiteResult[] = [];

for (const suite of suites) {
  const filePath = path.resolve(__dirname, '..', suite.file);
  try {
    const output = execSync(`npx tsx "${filePath}"`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    });
    
    // Parse pass count from outputs: "Summary: X passed" or "RESULTS: X passed"
    const match = output.match(/(?:Summary|RESULTS):\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?/i);
    const passed = match ? parseInt(match[1], 10) : 0;
    const failed = match && match[2] ? parseInt(match[2], 10) : 0;

    results.push({ name: suite.name, command: suite.file, passed, failed });
    totalPassed += passed;
    totalFailed += failed;
    console.log(`  [PASS] ${suite.name.padEnd(20)}: ${passed} passed, ${failed} failed`);
  } catch (err: any) {
    console.error(`  [FAIL] ${suite.name.padEnd(20)} failed execution:`, err.message);
    results.push({ name: suite.name, command: suite.file, passed: 0, failed: 1 });
    totalFailed += 1;
  }
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log(`  TOTAL SUITES: ${suites.length}`);
console.log(`  TOTAL TESTS:  ${totalPassed} passed, ${totalFailed} failed`);
console.log('═════════════════════════════════════════════════════════════\n');

if (totalFailed > 0 || totalPassed < 225) {
  console.error(`SCRAPER REGRESSION FAILED! Expected >= 225 passed tests, got ${totalPassed}`);
  process.exit(1);
} else {
  console.log('ALL 225 LOCKED SCRAPER TESTS PASSED WITH ZERO REGRESSIONS!');
}
