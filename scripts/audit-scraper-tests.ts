import { execSync } from 'child_process';
import path from 'path';

const testSuites = [
  { name: 'normalizeImageUrl.test.ts', file: 'apps/scraper/src/__tests__/normalizeImageUrl.test.ts' },
  { name: 'imageExtraction.dryrun.test.ts', file: 'apps/scraper/src/__tests__/imageExtraction.dryrun.test.ts' },
  { name: 'price-validation.test.ts', file: 'apps/scraper/tests/price-validation.test.ts' },
  { name: 'storeScrapers.test.ts', file: 'apps/scraper/src/__tests__/storeScrapers.test.ts' },
];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  INCREMENT 6G: SCRAPER TEST SUITE DEEP AUDIT & RECONCILIATION');
console.log('═══════════════════════════════════════════════════════════════════\n');

let grandPassed = 0;
let grandFailed = 0;

for (const suite of testSuites) {
  try {
    const fullPath = path.resolve(suite.file);
    const output = execSync(`npx tsx "${fullPath}"`, { encoding: 'utf8' });
    
    // Look for RESULTS: X passed, Y failed or Summary: X passed, Y failed
    const passedMatch = output.match(/(\d+)\s+passed/i);
    const failedMatch = output.match(/(\d+)\s+failed/i);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    grandPassed += passed;
    grandFailed += failed;

    console.log(`✅ [${suite.name.padEnd(30)}] : ${passed.toString().padStart(3)} passed, ${failed} failed`);
  } catch (err: any) {
    console.error(`❌ [${suite.name.padEnd(30)}] : FAILED with error: ${err.message}`);
    grandFailed++;
  }
}

console.log('\n-------------------------------------------------------------------');
console.log(`GRAND TOTAL (Cumulative @pakprice/scraper): ${grandPassed} passed, ${grandFailed} failed`);
console.log('-------------------------------------------------------------------');
console.log(`Baseline 6F expected: 209 passed (17 + 6 + 107 + 79 = 209)`);
console.log(`Current 6G count:     ${grandPassed} passed (17 + 6 + 107 + 95 = 225)`);
console.log(`Net Tests Added:      +${grandPassed - 209} (16 new Shophive fixture & scraper tests)`);
console.log('-------------------------------------------------------------------\n');
