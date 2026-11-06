import fs from 'fs';
import path from 'path';

const report = JSON.parse(fs.readFileSync('scripts/backfill_report_6p_dryrun_1792861713556.json', 'utf8'));

console.log('--- Checking REVVL TAB, Galaxy Watch 9, and other items in report records ---');
const interest = ['revvl', 'galaxy watch 9', 'galaxy watch ultra', 'kieslect', 'docomo'];
for (const word of interest) {
  const matches = (report.records || []).filter((r: any) => 
    (r.productTitle && r.productTitle.toLowerCase().includes(word)) ||
    (r.productName && r.productName.toLowerCase().includes(word))
  );
  console.log(`\nMatches for query "${word}": ${matches.length}`);
  for (const m of matches) {
    console.log(`  Store: ${m.storeSlug}, Outcome: ${m.outcome}, Reason: ${m.reason || 'None'}`);
  }
}
