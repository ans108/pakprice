import { ScrapeErrorCategory } from '@pakprice/shared';
import { StoreAccessBlockedError } from './scraperUtils';

export class ScrapeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapeTimeoutError';
  }
}

/**
 * Classifies an operational error into a standardized ScrapeErrorCategory.
 * Distinguishes operational failures from data-quality rejections.
 */
export function classifyScraperError(error: unknown): ScrapeErrorCategory {
  if (!error) return 'UNKNOWN';

  if (error instanceof StoreAccessBlockedError) {
    return 'ANTI_BOT';
  }

  const err = error as { name?: string; message?: string; code?: string; status?: number; statusCode?: number };
  const message = (err.message || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  const status = err.status || err.statusCode;

  if (name === 'scrapetimeouterror' || message.includes('timeout') || message.includes('timed out') || code === 'etimedout') {
    return 'TIMEOUT';
  }

  if (status === 429 || message.includes('429') || message.includes('too many requests') || message.includes('rate limit')) {
    return 'RATE_LIMITED';
  }

  if (
    message.includes('cloudflare') ||
    message.includes('captcha') ||
    message.includes('challenge') ||
    message.includes('bot detected') ||
    message.includes('access restricted')
  ) {
    return 'ANTI_BOT';
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('store unavailable') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable')
  ) {
    return 'STORE_UNAVAILABLE';
  }

  if (status && status >= 400 && status < 600) {
    return 'HTTP_ERROR';
  }

  if (
    code === 'econnrefused' ||
    code === 'econnreset' ||
    code === 'enotfound' ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('getaddrinfo') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  ) {
    return 'NETWORK_ERROR';
  }

  if (
    message.includes('parse') ||
    message.includes('syntax') ||
    message.includes('unexpected token') ||
    message.includes('cheerio') ||
    message.includes('invalid json')
  ) {
    return 'PARSE_ERROR';
  }

  if (
    message.includes('supabase') ||
    message.includes('postgrest') ||
    message.includes('database') ||
    message.includes('relation') ||
    message.includes('violates foreign key')
  ) {
    return 'DATABASE_ERROR';
  }

  if (
    message.includes('validation') ||
    message.includes('schema') ||
    message.includes('invalid price') ||
    message.includes('outlier')
  ) {
    return 'VALIDATION_ERROR';
  }

  return 'UNKNOWN';
}
