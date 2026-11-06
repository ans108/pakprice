/**
 * Freshness and availability derivation utilities.
 *
 * Availability is derived at read time from:
 *   - prices.in_stock (raw scraper observation)
 *   - prices.last_scraped_at (timestamp of last valid observation)
 *
 * Freshness is NEVER mutated. in_stock is NEVER changed merely because
 * a timestamp becomes old.
 *
 * Increment 5C — Price & Data Quality Hardening
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'stale' | 'unknown';

// ────────────────────────────────────────────────────────────────────────────
// Derivation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derive availability status from raw database fields.
 *
 * | Database state         | Freshness | Derived status |
 * |------------------------|-----------|----------------|
 * | in_stock = true        | fresh     | 'in_stock'     |
 * | in_stock = false       | fresh     | 'out_of_stock' |
 * | either value           | stale     | 'stale'        |
 * | last_scraped_at = null | —         | 'unknown'      |
 * | no price row           | —         | 'unknown'      |
 *
 * @param inStock        Raw in_stock value from the prices row. Null if no row exists.
 * @param lastScrapedAt  ISO 8601 timestamp of the last validated observation. Null if never scraped.
 * @param freshnessThresholdHours  Hours after which a price is considered stale. Default: 72.
 */
export function deriveAvailabilityStatus(
  inStock: boolean | null,
  lastScrapedAt: string | null,
  freshnessThresholdHours: number = 72
): AvailabilityStatus {
  // No observation ever recorded
  if (lastScrapedAt === null || lastScrapedAt === undefined) {
    return 'unknown';
  }

  // Parse the timestamp safely
  const scraped = new Date(lastScrapedAt);
  if (isNaN(scraped.getTime())) {
    // Malformed timestamp — treat as unknown rather than throwing
    return 'unknown';
  }

  const now = new Date();
  const ageMs = now.getTime() - scraped.getTime();
  const thresholdMs = freshnessThresholdHours * 60 * 60 * 1000;

  // Stale: observation is older than the freshness threshold
  if (ageMs > thresholdMs) {
    return 'stale';
  }

  // Fresh observations
  if (inStock === null || inStock === undefined) {
    return 'unknown';
  }

  return inStock ? 'in_stock' : 'out_of_stock';
}
