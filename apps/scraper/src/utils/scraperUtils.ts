import { scraperConfig } from '../config/scraperConfig';

// Known tracking query-parameter keys to strip from image URLs.
// CDN resize/quality params (w, h, format, q, fit, etc.) are intentionally NOT in this list.
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid',
]);

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class StoreAccessBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreAccessBlockedError';
  }
}

export const parsePrice = (priceStr: string | null | undefined): number | null => {
  if (!priceStr) return null;
  let s = priceStr.trim();
  // Strip trailing decimals like .00 or .50 before removing non-digits
  s = s.replace(/\.\d{1,2}$/, '');
  // Remove everything except digits
  const cleaned = s.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const price = parseInt(cleaned, 10);
  if (isNaN(price) || !Number.isFinite(price) || price <= 0) return null;
  return price;
};

export const parseDiscountPercent = (discountStr: string | null | undefined): number | null => {
  if (!discountStr) return null;
  const match = discountStr.match(/(\d+)%?/);
  if (match && match[1]) {
    const percent = parseInt(match[1], 10);
    if (percent >= 0 && percent <= 100) {
      return percent;
    }
  }
  return null;
};

export const normalizeWhitespace = (str: string | null | undefined): string | null => {
  if (!str) return null;
  return str.replace(/\s+/g, ' ').trim() || null;
};

/**
 * Validates and normalizes product image URLs.
 *
 * Rules (in order):
 *   1. Null/empty → null.
 *   2. Protocol-relative `//` → upgraded to `https:`.
 *   3. URLs exceeding `scraperConfig.imageMaxUrlLength` → null (data-URI guard).
 *   4. Scheme validation: only `http:` or `https:` accepted; `data:`, `blob:`,
 *      `javascript:` → null. (Checked after URL parsing, not via string prefix.)
 *   5. Strip known tracking query params (utm_*, ref, fbclid, gclid).
 *      CDN resize/quality params (w, h, format, q, fit, …) are preserved.
 *   6. Returns the final href string.
 *
 * No hostname TLD requirement. No image-extension requirement. No min-length check.
 */
export const normalizeImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  let cleaned = url.trim();
  if (!cleaned) return null;

  // Step 2: upgrade protocol-relative URLs
  if (cleaned.startsWith('//')) {
    cleaned = `https:${cleaned}`;
  }

  // Step 3: max-length guard (before parsing to avoid processing huge payloads)
  if (cleaned.length > scraperConfig.imageMaxUrlLength) {
    return null;
  }

  // Step 4: parse and validate scheme
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }

  const proto = parsed.protocol;
  if (proto !== 'http:' && proto !== 'https:') {
    // Rejects data:, blob:, javascript:, and any other non-HTTP schemes
    return null;
  }

  // Step 5: strip known tracking params (preserves all CDN params)
  let stripped = false;
  const keysToDelete: string[] = [];
  for (const key of parsed.searchParams.keys()) {
    if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    parsed.searchParams.delete(key);
    stripped = true;
  }

  return stripped ? parsed.href : cleaned;
};

/**
 * Checks if an error is transient (network / timeout / connection reset) vs permanent
 */
export const isTransientError = (error: any): boolean => {
  if (!error) return false;
  if (error instanceof StoreAccessBlockedError) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('navigation timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enetunreach') ||
    msg.includes('etimedout') ||
    msg.includes('err_connection_reset') ||
    msg.includes('err_connection_refused') ||
    msg.includes('err_network_changed') ||
    msg.includes('navigation failed') ||
    msg.includes('page crashed') ||
    msg.includes('net::')
  );
};

export interface RetryOptions {
  maxRetries?: number;
  backoffBaseMs?: number;
  onRetry?: (error: any, attempt: number) => void;
}

/**
 * Executes an async function with bounded exponential backoff retries on transient errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxRetries = options?.maxRetries ?? scraperConfig.maxRetries;
  const backoffBaseMs = options?.backoffBaseMs ?? scraperConfig.retryBackoffBaseMs;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > maxRetries || !isTransientError(error)) {
        throw error;
      }
      const delayMs = backoffBaseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      if (options?.onRetry) {
        options.onRetry(error, attempt);
      }
      await delay(delayMs);
    }
  }
}

/**
 * Runs a promise with an absolute timeout limit.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

