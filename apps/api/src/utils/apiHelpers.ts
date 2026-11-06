import { Response } from 'express';

// ────────────────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────────────────

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse and validate pagination parameters from a query string.
 * Clamps page to >= 1 and limit to [1, 100].
 * Invalid/missing values fall back to defaults.
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 20
): ParsedPagination {
  const rawPage = parseInt(String(query.page ?? '1'), 10);
  const rawLimit = parseInt(String(query.limit ?? String(defaultLimit)), 10);

  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = isNaN(rawLimit) || rawLimit < 1 ? defaultLimit : Math.min(rawLimit, 100);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

/**
 * Build the pagination metadata object for list API responses.
 */
export function buildPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Sort
// ────────────────────────────────────────────────────────────────────────────

export type SortOption =
  | 'relevance'
  | 'price_asc'
  | 'store_count_desc'
  | 'name_asc'
  | 'name_desc'
  | 'newest';

const VALID_SORT_OPTIONS: SortOption[] = [
  'relevance',
  'price_asc',
  'store_count_desc',
  'name_asc',
  'name_desc',
  'newest',
];

/**
 * Parse and validate the sort query parameter.
 * Falls back to 'relevance' for any unrecognised value.
 */
export function parseSort(query: Record<string, unknown>): SortOption {
  const raw = String(query.sort ?? '').trim().toLowerCase();
  return (VALID_SORT_OPTIONS as string[]).includes(raw)
    ? (raw as SortOption)
    : 'relevance';
}

/**
 * Parse a numeric price filter from query parameters.
 * Returns undefined if missing, NaN, or negative.
 */
export function parsePriceFilter(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return !isNaN(num) && num >= 0 ? num : undefined;
}

/**
 * Parse a boolean query parameter (e.g. inStock=true | 1).
 */
export function parseBooleanFilter(val: unknown): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const str = String(val).trim().toLowerCase();
  if (str === 'true' || str === '1') return true;
  if (str === 'false' || str === '0') return false;
  return undefined;
}

/**
 * Parse an integer filter (e.g. minStores=2).
 */
export function parseIntFilter(val: unknown, min = 0, max = 100): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const parsed = parseInt(String(val), 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return undefined;
  return parsed;
}

// ────────────────────────────────────────────────────────────────────────────
// Slug validation
// ────────────────────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,199}$/;

/**
 * Validate that a URL slug is safe to use in a database query.
 * Accepts lowercase alphanumeric and hyphens, 1–200 chars, must start with
 * an alphanumeric character.
 *
 * Returns the sanitised slug or null if invalid.
 */
export function validateSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return SLUG_REGEX.test(slug) ? slug : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Search query
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse and sanitise the search query parameter.
 * - Trims whitespace
 * - Returns empty string if not provided
 * - Caps at 200 characters to prevent abuse
 */
export function parseSearchQuery(query: Record<string, unknown>): string {
  return String(query.q ?? query.search ?? query.query ?? '').trim().slice(0, 200);
}

// ────────────────────────────────────────────────────────────────────────────
// Standard error responses
// ────────────────────────────────────────────────────────────────────────────

/**
 * Respond with 503 when Supabase is not configured.
 * Reuses the same response shape as the Phase 1 storesController.
 */
export function dbNotConfiguredResponse(res: Response): void {
  res.status(503).json({
    success: false,
    error: 'Database Not Configured',
    message:
      'Supabase environment variables are not set. ' +
      'Copy apps/api/.env.example to apps/api/.env and fill in your Supabase credentials.',
    statusCode: 503,
  });
}

/**
 * Respond with a clean 404 for a missing resource.
 * Does NOT expose internal IDs or DB details.
 */
export function notFoundResponse(res: Response, resourceName: string): void {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `${resourceName} not found.`,
    statusCode: 404,
  });
}

/**
 * Respond with a clean 500 without leaking internal error details.
 * The caller is responsible for logging the actual error before calling this.
 */
export function internalErrorResponse(res: Response): void {
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.',
    statusCode: 500,
  });
}
