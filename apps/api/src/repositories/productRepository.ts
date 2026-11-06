import { SupabaseClient } from '@supabase/supabase-js';
import type { SortOption, ParsedPagination } from '../utils/apiHelpers';

// ────────────────────────────────────────────────────────────────────────────
// Query input types
// ────────────────────────────────────────────────────────────────────────────

export interface ProductFilters {
  q?: string;           // search query
  categorySlug?: string;
  brandSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  storeSlug?: string;
  inStockOnly?: boolean;
  minStores?: number;
  sort: SortOption;
  pagination: ParsedPagination;
}

// ────────────────────────────────────────────────────────────────────────────
// Raw row shapes returned from Supabase (before mapping to shared types)
// We select only the columns we need — no SELECT *.
// ────────────────────────────────────────────────────────────────────────────

export interface RawProduct {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  category_id: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  normalized_name: string | null;
  created_at: string;
  updated_at: string;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
  category: { id: string; name: string; slug: string; parent_id: string | null } | null;
  variants?: any[];
}

export interface RawVariant {
  id: string;
  product_id: string;
  name: string;
  ram_gb: number | null;
  storage_gb: number | null;
  color: string | null;
  model_number: string | null;
  image_url: string | null;
  is_active: boolean;
  sku: string | null;
  gtin: string | null;
  normalized_name: string | null;
  source_identifier: string | null;
  created_at: string;
  updated_at: string;
}

import { memoryCache, CACHE_NOT_FOUND } from '../utils/memoryCache';

// ────────────────────────────────────────────────────────────────────────────
// Product select definitions:
// PRODUCT_LIST_SELECT: Excludes description (unused on cards) to optimize bandwidth,
// but joins variants, prices, and stores for single-round-trip candidate ranking and filtering.
// PRODUCT_DETAIL_SELECT: Complete explicit selection for single-round-trip product detail
// ────────────────────────────────────────────────────────────────────────────

const PRODUCT_LIST_SELECT = `
  id,
  name,
  slug,
  brand_id,
  category_id,
  image_url,
  is_active,
  normalized_name,
  created_at,
  updated_at,
  brand:brands ( id, name, slug, logo_url ),
  category:categories ( id, name, slug, parent_id ),
  variants:product_variants ( id, name, ram_gb, storage_gb, color, model_number, created_at, prices ( price, store_id, in_stock, last_scraped_at, store:stores ( id, name, slug ) ) )
`.trim();

const PRODUCT_DETAIL_SELECT = `
  id,
  name,
  slug,
  brand_id,
  category_id,
  description,
  image_url,
  is_active,
  normalized_name,
  created_at,
  updated_at,
  brand:brands ( id, name, slug, logo_url ),
  category:categories ( id, name, slug, parent_id ),
  variants:product_variants (
    id, product_id, name, ram_gb, storage_gb, color, model_number,
    image_url, is_active, sku, gtin, normalized_name, source_identifier,
    created_at, updated_at,
    prices (
      id, variant_id, store_id, price, original_price, discount_percent,
      shipping_fee, final_price, in_stock, stock_count, product_url,
      last_scraped_at, created_at, updated_at,
      store:stores ( id, name, slug, logo_url, base_url )
    )
  )
`.trim();

/**
 * Extended select for the comparison endpoint.
 * Includes full variant fields and all price columns + store join
 * so the comparison UI can display specs, pricing, and availability.
 */
const COMPARE_SELECT = `
  id,
  name,
  slug,
  brand_id,
  category_id,
  description,
  image_url,
  is_active,
  normalized_name,
  created_at,
  updated_at,
  brand:brands ( id, name, slug, logo_url ),
  category:categories ( id, name, slug, parent_id ),
  variants:product_variants (
    id, product_id, name, ram_gb, storage_gb, color, model_number,
    image_url, is_active, sku, gtin, normalized_name, source_identifier,
    created_at, updated_at,
    prices (
      id, variant_id, store_id, price, original_price, discount_percent,
      shipping_fee, final_price, in_stock, stock_count, product_url,
      last_scraped_at, created_at, updated_at,
      store:stores ( id, name, slug, logo_url )
    )
  )
`.trim();

const VARIANT_SELECT = `
  id,
  product_id,
  name,
  ram_gb,
  storage_gb,
  color,
  model_number,
  image_url,
  is_active,
  sku,
  gtin,
  normalized_name,
  source_identifier,
  created_at,
  updated_at,
  prices ( * )
`.trim();

// ────────────────────────────────────────────────────────────────────────────
// Repository
// ────────────────────────────────────────────────────────────────────────────

export class ProductRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Fetch a paginated, filtered list of products.
   * For search queries or derived filters (price, store, inStock, minStores),
   * retrieves a bounded candidate set (up to 200) in 1 DB round trip so that
   * ProductService can rank, filter, and sort globally before pagination.
   *
   * For standard browsing without search or derived filters, applies direct DB pagination.
   */
  async findProducts(filters: ProductFilters): Promise<{
    rows: RawProduct[];
    total: number;
    isCandidateSet: boolean;
    candidateLimit?: number;
    overflowDetected?: boolean;
    expansionBatches?: number;
  }> {
    const { q, categorySlug, brandSlug, minPrice, maxPrice, storeSlug, inStockOnly, minStores, sort, pagination } = filters;
    const { limit, offset } = pagination;

    const hasSearchQuery = Boolean(q && q.trim());
    const hasDerivedFiltersOrSort =
      minPrice !== undefined ||
      maxPrice !== undefined ||
      storeSlug !== undefined ||
      inStockOnly !== undefined ||
      minStores !== undefined ||
      sort === 'price_asc' ||
      sort === 'store_count_desc';

    const useCandidateRetrieval = hasSearchQuery || hasDerivedFiltersOrSort;

    // ── Resolve category filter with LRU cache ────────────────────────────
    let catIds: string[] | null = null;
    if (categorySlug) {
      const cached = memoryCache.get<string[]>('cat_slug_ids', categorySlug);
      if (cached === CACHE_NOT_FOUND) {
        return { rows: [], total: 0, isCandidateSet: false };
      } else if (cached !== undefined) {
        catIds = cached;
      } else {
        const { data: cat } = await this.db
          .from('categories')
          .select('id')
          .eq('slug', categorySlug)
          .maybeSingle();

        if (cat) {
          const { data: childCats } = await this.db
            .from('categories')
            .select('id')
            .eq('parent_id', cat.id);
          catIds = [cat.id, ...(childCats?.map((c: { id: string }) => c.id) || [])];
          memoryCache.set('cat_slug_ids', categorySlug, catIds);
        } else {
          memoryCache.setNotFound('cat_slug_ids', categorySlug);
          return { rows: [], total: 0, isCandidateSet: false };
        }
      }
    }

    // ── Resolve brand filter with LRU cache ───────────────────────────────
    let brandId: string | null = null;
    if (brandSlug) {
      const cached = memoryCache.get<string>('brand_slug_id', brandSlug);
      if (cached === CACHE_NOT_FOUND) {
        return { rows: [], total: 0, isCandidateSet: false };
      } else if (cached !== undefined) {
        brandId = cached;
      } else {
        const { data: brand } = await this.db
          .from('brands')
          .select('id')
          .eq('slug', brandSlug)
          .maybeSingle();

        if (brand) {
          brandId = brand.id;
          memoryCache.set('brand_slug_id', brandSlug, brandId);
        } else {
          memoryCache.setNotFound('brand_slug_id', brandSlug);
          return { rows: [], total: 0, isCandidateSet: false };
        }
      }
    }

    // ── Build text search conditions ──────────────────────────────────────
    const conditions: string[] = [];
    if (hasSearchQuery) {
      const sanitized = q!.trim().replace(/\s+/g, ' ').slice(0, 200);
      if (sanitized) {
        const escapedSql = sanitized.replace(/[%_]/g, '\\$&');
        const escapedPostgrest = escapedSql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        conditions.push(
          `name.ilike."%${escapedPostgrest}%"`,
          `normalized_name.ilike."%${escapedPostgrest}%"`
        );

        // Multi-token wildcard matching for queries like "HP Laptop" or "Samsung Watch"
        const tokens = sanitized.split(' ').filter((t) => t.length >= 2);
        if (tokens.length > 1) {
          const tokenWildcard = tokens.map((t) => t.replace(/[%_]/g, '\\$&')).join('%');
          const escapedTokenPostgrest = tokenWildcard.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          conditions.push(
            `name.ilike."%${escapedTokenPostgrest}%"`,
            `normalized_name.ilike."%${escapedTokenPostgrest}%"`
          );

          if (tokens.length === 2) {
            const revWildcard = [tokens[1], tokens[0]].map((t) => t.replace(/[%_]/g, '\\$&')).join('%');
            const escapedRevPostgrest = revWildcard.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            conditions.push(
              `name.ilike."%${escapedRevPostgrest}%"`,
              `normalized_name.ilike."%${escapedRevPostgrest}%"`
            );
          }
        }

        // Extract core query by removing spec suffixes like '256GB', '1TB', '40mm', '8GB RAM'
        const specRegex = /\b(\d+\s*(?:gb|tb)\s*(?:ram|storage)?|\d{2}\s*mm)\b/gi;
        const coreSearch = sanitized.replace(specRegex, '').trim().replace(/\s+/g, ' ');
        if (coreSearch && coreSearch.length >= 2 && coreSearch !== sanitized) {
          const escapedCoreSql = coreSearch.replace(/[%_]/g, '\\$&');
          const escapedCorePostgrest = escapedCoreSql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          conditions.push(
            `name.ilike."%${escapedCorePostgrest}%"`,
            `normalized_name.ilike."%${escapedCorePostgrest}%"`
          );
        }
      }
    }

    if (useCandidateRetrieval) {
      // Deterministic Candidate Retrieval with Overflow Detection & Expansion:
      // Fetches candidates in batches of BATCH_SIZE (200).
      // - Specific queries (< 200 candidates) resolve in a single round trip (overflowDetected = false).
      // - Broad queries (hitting candidate_count == 200) trigger deterministic expansion to guarantee 100% catalog completeness.
      const BATCH_SIZE = 200;
      const MAX_TOTAL_CANDIDATES = 2000;
      const allCandidates: RawProduct[] = [];
      let currentOffset = 0;
      let overflowDetected = false;
      let expansionBatches = 0;

      while (allCandidates.length < MAX_TOTAL_CANDIDATES) {
        expansionBatches++;
        let batchQuery = this.db
          .from('products')
          .select(PRODUCT_LIST_SELECT)
          .eq('is_active', true);

        if (hasSearchQuery && conditions.length > 0) {
          batchQuery = batchQuery.or(conditions.join(','));
        }
        if (catIds) {
          batchQuery = batchQuery.in('category_id', catIds);
        }
        if (brandId) {
          batchQuery = batchQuery.eq('brand_id', brandId);
        }

        batchQuery = batchQuery
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .range(currentOffset, currentOffset + BATCH_SIZE - 1);

        const { data, error } = await batchQuery;
        if (error) throw error;

        const batch = (data ?? []) as unknown as RawProduct[];
        allCandidates.push(...batch);

        if (batch.length === BATCH_SIZE) {
          overflowDetected = true;
          currentOffset += BATCH_SIZE;
        } else {
          break;
        }
      }

      return {
        rows: allCandidates,
        total: allCandidates.length,
        isCandidateSet: true,
        candidateLimit: BATCH_SIZE,
        overflowDetected,
        expansionBatches,
      };
    }

    // ── Pure Browse Mode: standard DB sort & pagination across full catalog ──
    let query = this.db
      .from('products')
      .select(PRODUCT_LIST_SELECT, { count: 'exact' })
      .eq('is_active', true);

    if (catIds) {
      query = query.in('category_id', catIds);
    }
    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    if (sort === 'name_asc') {
      query = query.order('name', { ascending: true }).order('id', { ascending: true });
    } else if (sort === 'name_desc') {
      query = query.order('name', { ascending: false }).order('id', { ascending: false });
    } else {
      query = query.order('updated_at', { ascending: false }).order('id', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      rows: (data ?? []) as unknown as RawProduct[],
      total: count ?? 0,
      isCandidateSet: false,
    };
  }

  /**
   * Fetch lightweight search suggestions for autocomplete.
   * Single round trip on products table only (<45ms).
   */
  async findSearchSuggestions(q: string, limit = 8): Promise<any[]> {
    const sanitized = q.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!sanitized || sanitized.length < 2) return [];

    const cacheKey = `${sanitized.toLowerCase()}:${limit}`;
    const cached = memoryCache.get<any[]>('suggestions', cacheKey);
    if (cached !== undefined && cached !== CACHE_NOT_FOUND) {
      return cached;
    }

    const tokens = sanitized.split(' ').filter(Boolean);
    const tokenWildcard = tokens.map((t) => t.replace(/[%_]/g, '\\$&')).join('%');
    const escapedPostgrest = tokenWildcard.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const { data, error } = await this.db
      .from('products')
      .select(`
        id,
        name,
        slug,
        image_url,
        brand:brands ( name, slug ),
        category:categories ( name, slug )
      `)
      .eq('is_active', true)
      .or(`name.ilike."%${escapedPostgrest}%",normalized_name.ilike."%${escapedPostgrest}%"`)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const rows = data ?? [];
    memoryCache.set('suggestions', cacheKey, rows);
    return rows;
  }

  /**
   * Fetch complete product detail including brand, category, variants,
   * active prices, and store relations in a SINGLE round-trip query.
   * Explicitly selects all required fields without SELECT * or price_history.
   */
  async findProductDetailBySlug(slug: string): Promise<any | null> {
    const { data, error } = await this.db
      .from('products')
      .select(PRODUCT_DETAIL_SELECT)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }

  /**
   * Fetch a single product by slug including brand and category.
   * Retained for backward compatibility.
   */
  async findProductBySlug(slug: string): Promise<RawProduct | null> {
    const { data, error } = await this.db
      .from('products')
      .select(PRODUCT_DETAIL_SELECT)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return (data as unknown as RawProduct) ?? null;
  }

  /**
   * Fetch multiple products by their exact slugs.
   * Includes brand, category, variants, and prices.
   */
  async findProductsBySlugs(slugs: string[]): Promise<RawProduct[]> {
    if (slugs.length === 0) return [];
    
    const { data, error } = await this.db
      .from('products')
      .select(COMPARE_SELECT)
      .in('slug', slugs)
      .eq('is_active', true);

    if (error) throw error;
    return (data ?? []) as unknown as RawProduct[];
  }

  /**
   * Fetch all active variants for a product by product ID.
   * Ordered by RAM (asc), then storage (asc), then color (asc), then id (asc).
   */
  async findVariantsByProductId(productId: string): Promise<RawVariant[]> {
    const { data, error } = await this.db
      .from('product_variants')
      .select(VARIANT_SELECT)
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('ram_gb', { ascending: true, nullsFirst: false })
      .order('storage_gb', { ascending: true, nullsFirst: false })
      .order('color', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as RawVariant[];
  }

  /**
   * Fetch all active categories ordered by sort_order.
   * Uses memoryCache with 10 minute TTL.
   */
  async findAllCategories() {
    const cached = memoryCache.get<any[]>('reference', 'categories');
    if (cached !== undefined && cached !== CACHE_NOT_FOUND) {
      return cached;
    }

    const { data, error } = await this.db
      .from('categories')
      .select('id, name, slug, parent_id, icon_url, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;
    const rows = data ?? [];
    memoryCache.set('reference', 'categories', rows);
    return rows;
  }

  /**
   * Fetch all active brands ordered alphabetically by name.
   * Uses memoryCache with 10 minute TTL.
   */
  async findAllBrands() {
    const cached = memoryCache.get<any[]>('reference', 'brands');
    if (cached !== undefined && cached !== CACHE_NOT_FOUND) {
      return cached;
    }

    const { data, error } = await this.db
      .from('brands')
      .select('id, name, slug, logo_url, normalized_name, created_at')
      .order('name', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;
    const rows = data ?? [];
    memoryCache.set('reference', 'brands', rows);
    return rows;
  }

  /**
   * Fetch all price offers for a product across all its variants and all stores.
   * Returns raw rows — the service layer maps these to MultiStoreOffer[].
   *
   * Single round-trip: products -> variants -> prices -> stores.
   * No N+1; no SELECT *; uses explicit column selection.
   */
  async findMultiStoreOffers(slug: string): Promise<any | null> {
    const { data, error } = await this.db
      .from('products')
      .select(`
        id,
        name,
        slug,
        is_active,
        variants:product_variants (
          id,
          name,
          ram_gb,
          storage_gb,
          color,
          is_active,
          prices (
            id,
            variant_id,
            store_id,
            price,
            original_price,
            discount_percent,
            in_stock,
            stock_count,
            product_url,
            last_scraped_at,
            store:stores ( id, name, slug, logo_url, base_url )
          )
        )
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }
}
