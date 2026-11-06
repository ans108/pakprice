import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Safe parsing with sensible bounds
const parseBoundedInt = (val: string | undefined, defaultVal: number, min: number, max: number): number => {
  const parsed = parseInt(val || '', 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.min(Math.max(parsed, min), max);
};

export const scraperConfig = {
  // Bounded scraper concurrency (never allow unbounded/unsafe parallelism)
  concurrency: parseBoundedInt(process.env.SCRAPER_CONCURRENCY, 2, 1, 5),
  perStoreConcurrency: parseBoundedInt(process.env.SCRAPER_PER_STORE_CONCURRENCY, 1, 1, 3),
  
  // Rate limiting / delays (minimum 500ms for politeness)
  delayMs: Math.max(parseInt(process.env.SCRAPER_REQUEST_DELAY_MS || '1500', 10) || 1500, 500),
  
  // Granular Timeouts
  navigationTimeoutMs: parseInt(process.env.SCRAPER_NAV_TIMEOUT_MS || '25000', 10),
  selectorTimeoutMs: parseInt(process.env.SCRAPER_SELECTOR_TIMEOUT_MS || '5000', 10),
  requestTimeoutMs: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT_MS || '15000', 10),
  overallStoreTimeoutMs: parseInt(process.env.SCRAPER_STORE_TIMEOUT_MS || '600000', 10), // 10 minutes max per store
  timeoutMs: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT_MS || '25000', 10), // legacy alias
  
  // Retries with exponential backoff
  maxRetries: parseBoundedInt(process.env.SCRAPER_MAX_RETRIES, 2, 0, 4),
  retryBackoffBaseMs: parseInt(process.env.SCRAPER_RETRY_BACKOFF_MS || '1000', 10),
  
  // Dry run prevents DB modification
  dryRun: process.env.SCRAPER_DRY_RUN === 'true',
  
  // Max products limit for testing controlled ingestion
  maxProducts: process.env.SCRAPER_MAX_PRODUCTS ? parseInt(process.env.SCRAPER_MAX_PRODUCTS, 10) : null,

  // User-Agent (polite, transparent identification)
  userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)',

  // 5C: Price outlier detection — configurable with safe defaults
  priceDropThresholdPct: parseBoundedInt(process.env.PRICE_DROP_THRESHOLD_PCT, 80, 50, 99),
  priceIncreaseThresholdPct: parseBoundedInt(process.env.PRICE_INCREASE_THRESHOLD_PCT, 500, 200, 2000),

  // 5C: History dedup — minimum hours between identical snapshots
  historySnapshotIntervalHours: parseBoundedInt(process.env.HISTORY_SNAPSHOT_INTERVAL_HOURS, 24, 1, 168),

  // 5D: Image URL max length guard — configurable safety limit
  // CDN image URLs are never close to 2048 chars; this guards against data-URI smuggling.
  imageMaxUrlLength: parseBoundedInt(process.env.IMAGE_MAX_URL_LENGTH, 2048, 256, 8192),

  // 5F: Stale job threshold (minutes) before a running job is flagged as stale
  staleJobThresholdMinutes: parseBoundedInt(process.env.STALE_JOB_THRESHOLD_MINUTES, 60, 5, 1440),

  // 6I: Scheduler & Freshness Configuration
  schedulerEnabled: process.env.ENABLE_SCHEDULER === 'true',

  // 6J: Scheduler Activation Mode — getter reads env var at access time for runtime flexibility.
  // Valid: 'disabled' (default, safe no-op) | 'observe' (log only, zero mutations) | 'active' (production execution)
  get schedulerActivationMode(): 'disabled' | 'observe' | 'active' {
    const raw = (process.env.SCHEDULER_ACTIVATION_MODE || 'disabled').toLowerCase().trim();
    const validModes: readonly string[] = ['disabled', 'observe', 'active'];
    if (!validModes.includes(raw)) {
      console.error(
        `CONFIGURATION ERROR: Invalid SCHEDULER_ACTIVATION_MODE="${raw}". ` +
        `Valid values: ${validModes.join(', ')}. Defaulting to "disabled".`
      );
      return 'disabled';
    }
    return raw as 'disabled' | 'observe' | 'active';
  },

  schedulerTimezone: process.env.SCHEDULER_TIMEZONE || 'Asia/Karachi',
  scrapeSchedule: process.env.SCRAPE_SCHEDULE || '0 */6 * * *', // legacy global schedule

  // 6I: Coverage Policy — Initial threshold; review after observing production scrape metrics.
  minimumCoveragePct: parseBoundedInt(process.env.SCRAPER_MIN_COVERAGE_PCT, 70, 50, 95),

  // 6I: Refresh URL batch limit
  refreshUrlLimit: parseBoundedInt(process.env.REFRESH_URL_LIMIT, 200, 10, 1000),

  // 6J: Freshness threshold (hours) — URLs not scraped within this window are considered stale
  freshnessThresholdHours: parseBoundedInt(process.env.FRESHNESS_THRESHOLD_HOURS, 24, 1, 168),

  // Supabase
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

export interface StoreScheduleConfig {
  eligibility: 'production' | 'experimental' | 'blocked';
  discoverySchedule: string | null;
  refreshSchedule: string | null;
}

export const storeScheduleConfigs: Record<string, StoreScheduleConfig> = {
  priceoye: {
    eligibility: 'production',
    discoverySchedule: process.env.DISCOVERY_SCHEDULE_PRICEOYE || '0 3 * * *',
    refreshSchedule: process.env.REFRESH_SCHEDULE_PRICEOYE || '10 */4 * * *',
  },
  telemart: {
    eligibility: 'production',
    discoverySchedule: process.env.DISCOVERY_SCHEDULE_TELEMART || '30 3 * * *',
    refreshSchedule: process.env.REFRESH_SCHEDULE_TELEMART || '25 */6 * * *',
  },
  'mega-pk': {
    eligibility: 'production',
    discoverySchedule: process.env.DISCOVERY_SCHEDULE_MEGAPK || '0 4 * * *',
    refreshSchedule: process.env.REFRESH_SCHEDULE_MEGAPK || '40 */6 * * *',
  },
  shophive: {
    eligibility: 'production',
    discoverySchedule: process.env.DISCOVERY_SCHEDULE_SHOPHIVE || '30 4 * * *',
    refreshSchedule: process.env.REFRESH_SCHEDULE_SHOPHIVE || '55 */6 * * *',
  },
  paklap: {
    eligibility: 'blocked',
    discoverySchedule: null,
    refreshSchedule: null,
  },
  daraz: {
    eligibility: 'experimental',
    discoverySchedule: null,
    refreshSchedule: null,
  },
};

if (!scraperConfig.supabaseUrl || !scraperConfig.supabaseServiceKey) {
  console.warn("WARNING: Supabase URL or Service Role Key missing in environment for scraper.");
}
