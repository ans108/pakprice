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
  notFoundResponse,
  internalErrorResponse,
} from '../utils/apiHelpers';

function getService(): ProductService {
  return new ProductService(supabase!);
}

export const productsController = {
  /**
   * GET /api/v1/products
   *
   * Query parameters (all optional):
   *   q          — search term (case-insensitive partial match)
   *   category   — category slug
   *   brand      — brand slug
   *   store      — store slug
   *   minPrice   — minimum price filter (PKR)
   *   maxPrice   — maximum price filter (PKR)
   *   inStock    — boolean, only in-stock
   *   minStores  — minimum verified store count
   *   page       — page number, default 1, min 1
   *   limit      — per page, default 20, max 100
   *   sort       — relevance | price_asc | store_count_desc | name_asc | name_desc | newest
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const q = parseSearchQuery(req.query as Record<string, unknown>);
      const sort = parseSort(req.query as Record<string, unknown>);
      const pagination = parsePagination(req.query as Record<string, unknown>);

      // Validate and sanitise slug params
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

      // If provided slugs failed validation, return empty result (not 400 —
      // avoids exposing validation details that could aid enumeration)
      if (rawCategory && !categorySlug) {
        res.status(200).json({ success: true, data: [], pagination: { page: 1, limit: pagination.limit, total: 0, totalPages: 0 } });
        return;
      }
      if (rawBrand && !brandSlug) {
        res.status(200).json({ success: true, data: [], pagination: { page: 1, limit: pagination.limit, total: 0, totalPages: 0 } });
        return;
      }
      if (rawStore && !storeSlug) {
        res.status(200).json({ success: true, data: [], pagination: { page: 1, limit: pagination.limit, total: 0, totalPages: 0 } });
        return;
      }

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
      logger.error({ err }, 'productsController.list failed');
      internalErrorResponse(res);
    }
  },

  /**
   * GET /api/v1/products/:slug
   * Returns the product with its variants. Prices array is empty in Phase 2.
   */
  async detail(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    const slug = validateSlug(req.params.slug ?? '');
    if (!slug) {
      notFoundResponse(res, 'Product');
      return;
    }

    try {
      const service = getService();
      const result = await service.getProductDetail(slug);

      if (!result) {
        notFoundResponse(res, 'Product');
        return;
      }

      res.status(200).json(result);
    } catch (err) {
      logger.error({ err, slug }, 'productsController.detail failed');
      internalErrorResponse(res);
    }
  },

  /**
   * GET /api/v1/products/:slug/variants
   * Returns only the variants for a product.
   */
  async variants(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    const slug = validateSlug(req.params.slug ?? '');
    if (!slug) {
      notFoundResponse(res, 'Product');
      return;
    }

    try {
      const service = getService();
      const variants = await service.getVariantsForSlug(slug);

      if (variants === null) {
        notFoundResponse(res, 'Product');
        return;
      }

      res.status(200).json({
        success: true,
        data: variants,
        meta: { total: variants.length },
      });
    } catch (err) {
      logger.error({ err, slug }, 'productsController.variants failed');
      internalErrorResponse(res);
    }
  },

  /**
   * GET /api/v1/products/compare?slugs=slug1,slug2
   * Max 4 slugs.
   */
  async compare(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    try {
      const slugsParam = String(req.query.slugs ?? '').trim();
      if (!slugsParam) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Missing slugs parameter', statusCode: 400 });
        return;
      }

      // Deduplicate slugs
      const slugs = Array.from(new Set(slugsParam.split(',').map(s => s.trim()).filter(Boolean)));

      if (slugs.length === 0) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'No valid slugs provided', statusCode: 400 });
        return;
      }

      if (slugs.length > 4) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Maximum 4 products allowed for comparison', statusCode: 400 });
        return;
      }

      const service = getService();
      const result = await service.getProductsBySlugs(slugs);

      res.status(200).json({
        success: true,
        ...result,
        count: result.products.length,
      });
    } catch (err) {
      logger.error({ err }, 'productsController.compare failed');
      internalErrorResponse(res);
    }
  },

  /**
   * GET /api/v1/products/:slug/offers
   *
   * Returns all price offers for a product across all stores and variants.
   * Offers are sorted by price ascending (in-stock first).
   * Includes lowest_price, store_count, has_multi_store summary fields.
   *
   * This is a read-only aggregation endpoint — no data is written.
   */
  async offers(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      dbNotConfiguredResponse(res);
      return;
    }

    const slug = validateSlug(req.params.slug ?? '');
    if (!slug) {
      notFoundResponse(res, 'Product');
      return;
    }

    try {
      const variantId = typeof req.query.variant_id === 'string' ? req.query.variant_id.trim() : undefined;
      const service = getService();
      const result = await service.getMultiStoreOffers(slug, variantId);

      if (!result) {
        notFoundResponse(res, 'Product');
        return;
      }

      res.status(200).json(result);
    } catch (err) {
      logger.error({ err, slug }, 'productsController.offers failed');
      internalErrorResponse(res);
    }
  },
};
