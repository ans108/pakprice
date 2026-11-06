/**
 * scripts/report-store-freshness.ts
 *
 * READ-ONLY diagnostic script — reports price freshness for all production stores.
 *
 * SAFETY GUARANTEES:
 * - Never inserts, updates, or deletes any database row
 * - Never resets scrape jobs
 * - Never triggers scraper execution
 * - Uses aggregate/batched queries (no N+1)
 *
 * Usage: npx tsx scripts/report-store-freshness.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

import { createClient } from '@supabase/supabase-js';
import { FreshnessMonitoringService } from '../apps/scraper/src/services/FreshnessMonitoringService';
import { scraperConfig } from '../apps/scraper/src/config/scraperConfig';

const supabaseUrl = process.env.SUPABASE_URL || scraperConfig.supabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || scraperConfig.supabaseServiceKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function toKarachiTime(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  } catch {
    return iso;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STORE FRESHNESS REPORT');
  console.log(`  Generated: ${toKarachiTime(new Date().toISOString())} PKT`);
  console.log(`  Freshness Threshold: ${scraperConfig.freshnessThresholdHours}h`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const service = new FreshnessMonitoringService(supabase);
  const { reports, totalQueries } = await service.getAllStoreFreshnessReports();

  if (reports.length === 0) {
    console.log('No production stores found in database.');
    process.exit(0);
  }

  // Table header
  const header = [
    'Store'.padEnd(12),
    'URLs'.padStart(6),
    'Fresh'.padStart(6),
    'Stale'.padStart(6),
    'Unknown'.padStart(8),
    'Coverage'.padStart(10),
    'Oldest Refresh'.padEnd(22),
    'Last Discovery'.padEnd(22),
  ].join('  ');

  console.log(header);
  console.log('─'.repeat(header.length));

  for (const r of reports) {
    const row = [
      r.storeSlug.padEnd(12),
      String(r.totalUrls).padStart(6),
      String(r.freshCount).padStart(6),
      String(r.staleCount).padStart(6),
      String(r.unknownCount).padStart(8),
      `${r.coveragePct}%`.padStart(10),
      toKarachiTime(r.oldestLastScrapedAt).padEnd(22),
      toKarachiTime(r.lastSuccessfulDiscovery).padEnd(22),
    ].join('  ');
    console.log(row);
  }

  // Per-store detail section
  console.log('\n--- Detailed Per-Store Report ---\n');
  for (const r of reports) {
    console.log(`  ${r.storeName} (${r.storeSlug})`);
    console.log(`    Total URLs:         ${r.totalUrls}`);
    console.log(`    Fresh (< ${scraperConfig.freshnessThresholdHours}h):   ${r.freshCount}`);
    console.log(`    Stale (> ${scraperConfig.freshnessThresholdHours}h):   ${r.staleCount}`);
    console.log(`    Unknown (null):     ${r.unknownCount}`);
    console.log(`    Coverage:           ${r.coveragePct}%`);
    console.log(`    Oldest Scraped:     ${toKarachiTime(r.oldestLastScrapedAt)}`);
    console.log(`    Newest Scraped:     ${toKarachiTime(r.newestLastScrapedAt)}`);
    console.log(`    Last Discovery:     ${toKarachiTime(r.lastSuccessfulDiscovery)}`);
    console.log(`    Last Refresh:       ${toKarachiTime(r.lastSuccessfulRefresh)}`);
    console.log('');
  }

  console.log(`Total database queries: ${totalQueries}`);
  console.log('This report is READ-ONLY. No database mutations occurred.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
