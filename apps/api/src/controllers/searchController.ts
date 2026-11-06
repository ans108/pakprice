import { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../database/supabase';
import { ProductService } from '../services/productService';
import logger from '../utils/logger';
import {
  parsePagination,
  parseSort,
  parseSearchQuery,
  validateSlug,
  parsePriceFilter,
  parseBooleanFilter,
  parseIntFilter,
  dbNotConfiguredResponse,
  internalErrorResponse,
} from '../utils/apiHelpers';

function getService(): ProductService {
  return new ProductService(supabase!);
}

export const searchController = {
  /**
   * GET /api/v1/search
   *
   * Unified search endpoint. Uses the same ProductService.listProducts()
   * as the /products endpoint — no duplicated search logic.
   *
   * Query parameters (all optional):
   *   q          — search term (required for meaningful results)
   *   category   — category slug filter
   *   brand      — brand slug filter
   *   store      — store slug filter
   *   minPrice   — minimum price filter (PKR)
   *   maxPrice   — maximum price filter (PKR)
   *   inStock    — boolean, only return in-stock products
   *   minStores  — minimum number of verified stores offering product
   *   page       — default 1
   *   limit      — default 20, max 100
   *   sort       — relevance | price_asc | store_count_desc | name_asc | name_desc | newest
   */
  async search(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const q = parseSearchQuery(req.query as Record<string, unknown>);
      const sort = parseSort(req.query as Record<string, unknown>);
      const pagination = parsePagination(req.query as Record<string, unknown>);

      const rawCategory = String(req.query.category ?? '').trim().toLowerCase();
      const rawBrand = String(req.query.brand ?? '').trim().toLowerCase();
      const rawStore = String(req.query.store ?? '').trim().toLowerCase();

      const categorySlug = rawCategory ? (validateSlug(rawCategory) ?? undefined) : undefined;
      const brandSlug = rawBrand ? (validateSlug(rawBrand) ?? undefined) : undefined;
      const storeSlug = rawStore ? (validateSlug(rawStore) ?? undefined) : undefined;

      const minPrice = parsePriceFilter(req.query.minPrice);
      const maxPrice = parsePriceFilter(req.query.maxPrice);
      const inStockOnly = parseBooleanFilter(req.query.inStock);
      const minStores = parseIntFilter(req.query.minStores, 1, 50);

      const service = getService();
      const result = await service.listProducts({
        q,
        categorySlug,
        brandSlug,
        minPrice,
        maxPrice,
        storeSlug,
        inStockOnly,
        minStores,
        sort,
        pagination,
      });

      res.status(200).json(result);
    } catch (err) {
      logger.error({ err }, 'searchController.search failed');
      internalErrorResponse(res);
    }
  },

  /**
   * GET /api/v1/search/suggestions
   *
   * Lightweight autocomplete suggestion endpoint.
   * Returns bounded 6 suggestions in < 45ms.
   */
  async suggestions(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const q = parseSearchQuery(req.query as Record<string, unknown>);
      if (!q || q.length < 2) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const limit = parseIntFilter(req.query.limit, 1, 20) ?? 8;
      const service = getService();
      const result = await service.getSearchSuggestions(q, limit);
      res.status(200).json(result);
    } catch (err) {
      logger.error({ err }, 'searchController.suggestions failed');
      internalErrorResponse(res);
    }
  },
};
