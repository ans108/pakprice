import { SupabaseClient } from '@supabase/supabase-js';
import { ProductRepository, ProductFilters } from '../repositories/productRepository';
import { buildPaginationMeta } from '../utils/apiHelpers';
import { memoryCache, CACHE_NOT_FOUND } from '../utils/memoryCache';
import {
  Brand,
  Category,
  CompareProduct,
  CompareResponse,
  MultiStoreOffer,
  OffersResponse,
  ProductDetailResponse,
  ProductListResponse,
  ProductVariant,
  ProductWithRelations,
  Price,
  deriveAvailabilityStatus,
  AvailabilityStatus,
  SearchSuggestion,
  SearchSuggestionsResponse,
} from '@pakprice/shared';

/**
 * ProductService — business logic layer.
 *
 * Both the products controller (GET /api/v1/products) and the search controller
 * (GET /api/v1/search) call this service. There is no duplicated search logic.
 *
 * Responsibilities:
 *   - Delegates all DB access to ProductRepository
 *   - Maps raw DB rows to shared API types
 *   - Builds pagination metadata
 *   - Does NOT handle HTTP — callers do that
 */
export class ProductService {
  private readonly repo: ProductRepository;

  constructor(db: SupabaseClient) {
    this.repo = new ProductRepository(db);
  }

  // ── Products list / search ─────────────────────────────────────────────

  /**
   * Fetch a paginated, filtered list of products.
   * Used by both GET /api/v1/products and GET /api/v1/search.
   * When search query or derived filters/sorts are used, applies global
   * candidate scoring, filtering, and sorting before pagination.
   */
  async listProducts(filters: ProductFilters): Promise<ProductListResponse> {
    const q = filters.q?.trim() || '';
    const hasSearchQuery = Boolean(q);
    const hasDerivedFilters =
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.storeSlug !== undefined ||
      filters.inStockOnly !== undefined ||
      filters.minStores !== undefined ||
      filters.sort === 'price_asc' ||
      filters.sort === 'store_count_desc';

    // LRU Search Cache (Phase 16) - 60s TTL
    let cacheKey = '';
    if (hasSearchQuery || hasDerivedFilters) {
      cacheKey = [
        q,
        filters.categorySlug || '',
        filters.brandSlug || '',
        filters.minPrice !== undefined ? String(filters.minPrice) : '',
        filters.maxPrice !== undefined ? String(filters.maxPrice) : '',
        filters.storeSlug || '',
        filters.inStockOnly !== undefined ? String(filters.inStockOnly) : '',
        filters.minStores !== undefined ? String(filters.minStores) : '',
        filters.sort,
        filters.pagination.page,
        filters.pagination.limit,
      ].join(':');

      const cached = memoryCache.get<ProductListResponse>('search_results', cacheKey);
      if (cached !== undefined && cached !== CACHE_NOT_FOUND) {
        return cached;
      }
    }

    const { rows, total, isCandidateSet } = await this.repo.findProducts(filters);

    if (!isCandidateSet) {
      const data: ProductWithRelations[] = rows.map(mapProduct);
      const pagination = buildPaginationMeta(total, filters.pagination.page, filters.pagination.limit);
      return { success: true, data, pagination };
    }

    // Step 1: Map all candidate products and derive eligibility & metadata
    const candidates: Array<{
      product: ProductWithRelations;
      raw: any;
      storeSlugs: Set<string>;
      inStock: boolean;
      score: number;
    }> = [];

    for (const raw of rows) {
      const p = mapProduct(raw);
      const storeSlugs = new Set<string>();
      let inStock = false;

      if (raw.variants && Array.isArray(raw.variants)) {
        for (const v of raw.variants) {
          if (v.prices && Array.isArray(v.prices)) {
            for (const price of v.prices) {
              if (price.in_stock) inStock = true;
              if (price.store?.slug) storeSlugs.add(price.store.slug);
            }
          }
        }
      }

      const score = q ? calculateRelevanceScore(p, raw, q) : 0;
      p.relevance_score = score;

      candidates.push({ product: p, raw, storeSlugs, inStock, score });
    }

    // Step 2: Global Filtering BEFORE pagination
    const filtered = candidates.filter((item) => {
      const p = item.product;

      if (filters.minPrice !== undefined) {
        if (p.lowest_price === null || p.lowest_price === undefined || p.lowest_price < filters.minPrice) {
          return false;
        }
      }

      if (filters.maxPrice !== undefined) {
        if (p.lowest_price === null || p.lowest_price === undefined || p.lowest_price > filters.maxPrice) {
          return false;
        }
      }

      if (filters.storeSlug) {
        const targetStore = filters.storeSlug === 'megapk' ? 'mega-pk' : filters.storeSlug;
        if (!item.storeSlugs.has(targetStore)) {
          return false;
        }
      }

      if (filters.inStockOnly !== undefined) {
        if (filters.inStockOnly === true && !item.inStock) {
          return false;
        }
        if (filters.inStockOnly === false && item.inStock) {
          return false;
        }
      }

      if (filters.minStores !== undefined) {
        if ((p.store_count ?? 0) < filters.minStores) {
          return false;
        }
      }

      return true;
    });

    // Step 3: Global Sorting BEFORE pagination
    const sort = filters.sort;
    filtered.sort((a, b) => {
      const pA = a.product;
      const pB = b.product;

      if (sort === 'price_asc') {
        const priceA = pA.lowest_price ?? Infinity;
        const priceB = pB.lowest_price ?? Infinity;
        if (priceA !== priceB) return priceA - priceB;
        if (b.score !== a.score) return b.score - a.score;
        return pA.id.localeCompare(pB.id);
      }

      if (sort === 'store_count_desc') {
        const countA = pA.store_count ?? 0;
        const countB = pB.store_count ?? 0;
        if (countA !== countB) return countB - countA;
        const priceA = pA.lowest_price ?? Infinity;
        const priceB = pB.lowest_price ?? Infinity;
        if (priceA !== priceB) return priceA - priceB;
        return pA.id.localeCompare(pB.id);
      }

      if (sort === 'name_asc') {
        const nameCmp = pA.name.localeCompare(pB.name);
        if (nameCmp !== 0) return nameCmp;
        return pA.id.localeCompare(pB.id);
      }

      if (sort === 'name_desc') {
        const nameCmp = pB.name.localeCompare(pA.name);
        if (nameCmp !== 0) return nameCmp;
        return pA.id.localeCompare(pB.id);
      }

      if (sort === 'newest') {
        const timeA = new Date(pA.updated_at).getTime();
        const timeB = new Date(pB.updated_at).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return pA.id.localeCompare(pB.id);
      }

      // Default: 'relevance'
      if (b.score !== a.score) return b.score - a.score;
      const countA = pA.store_count ?? 0;
      const countB = pB.store_count ?? 0;
      if (countA !== countB) return countB - countA;
      return pA.id.localeCompare(pB.id);
    });

    // Step 4: Global Pagination
    const totalCount = filtered.length;
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;
    const pagedItems = filtered.slice(offset, offset + limit).map((item) => item.product);
    const pagination = buildPaginationMeta(totalCount, page, limit);
    const result: ProductListResponse = { success: true, data: pagedItems, pagination };

    if (cacheKey) {
      memoryCache.set('search_results', cacheKey, result, 60 * 1000);
    }

    return result;
  }

  /**
   * Fetch lightweight search suggestions for autocomplete.
   */
  async getSearchSuggestions(q: string, limit = 8): Promise<SearchSuggestionsResponse> {
    const rows = await this.repo.findSearchSuggestions(q, limit);
    const suggestions: SearchSuggestion[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      brand: r.brand ? { name: r.brand.name, slug: r.brand.slug } : null,
      category: r.category ? { name: r.category.name, slug: r.category.slug } : null,
      thumbnail: r.image_url ?? null,
    }));
    return { success: true, data: suggestions };
  }

  // ── Single product detail ──────────────────────────────────────────────

  /**
   * Fetch a single product with its variants and offers by slug in a single round trip.
   * Returns null if the product does not exist or is not active.
   */
  async getProductDetail(slug: string): Promise<ProductDetailResponse | null> {
    const raw = await this.repo.findProductDetailBySlug(slug);
    if (!raw) return null;

    const product = mapProduct(raw);
    const rawVariants: any[] = raw.variants || [];

    // Deterministic sorting of variants: RAM (asc), Storage (asc), Color (asc), ID (asc)
    rawVariants.sort((a: any, b: any) => {
      const ramA = a.ram_gb ?? 0;
      const ramB = b.ram_gb ?? 0;
      if (ramA !== ramB) return ramA - ramB;

      const storageA = a.storage_gb ?? 0;
      const storageB = b.storage_gb ?? 0;
      if (storageA !== storageB) return storageA - storageB;

      const colorA = a.color ?? '';
      const colorB = b.color ?? '';
      if (colorA !== colorB) return colorA.localeCompare(colorB);

      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

    const variants: ProductVariant[] = rawVariants.map(mapVariant);

    // Flatten prices from all variants and attach to variant objects
    const prices: any[] = [];
    rawVariants.forEach((rv: any) => {
      if (rv.prices && Array.isArray(rv.prices)) {
        prices.push(...rv.prices);
      }
    });

    // Ensure variants have their prices array attached for consumers like ProductDetailClient
    const variantsWithPrices = variants.map((v) => {
      const rawV = rawVariants.find((rv) => rv.id === v.id);
      return {
        ...v,
        prices: rawV?.prices || [],
      };
    });

    return {
      success: true,
      data: {
        product,
        variants: variantsWithPrices as any,
        prices,
      },
    };
  }

  /**
   * Compare multiple products by their slugs.
   */
  async getProductsBySlugs(slugs: string[]): Promise<{ products: CompareProduct[]; missingSlugs: string[] }> {
    const rawProducts = await this.repo.findProductsBySlugs(slugs);
    const products: CompareProduct[] = rawProducts.map((raw) => {
      const p = mapProduct(raw) as CompareProduct;
      const rawAny = raw as any;
      p.variants = (rawAny.variants || []).map((v: any) => ({
        ...mapVariant(v),
        prices: v.prices || []
      }));
      return p;
    });
    
    const foundSlugs = new Set(products.map(p => p.slug));
    const missingSlugs = slugs.filter(slug => !foundSlugs.has(slug));

    // Sort products so they match the order of the requested slugs where possible
    const sortedProducts = [];
    for (const slug of slugs) {
      const p = products.find(prod => prod.slug === slug);
      if (p) sortedProducts.push(p);
    }

    return {
      products: sortedProducts,
      missingSlugs,
    };
  }

  // ── Variants only ──────────────────────────────────────────────────────

  /**
   * Fetch only variants for a product identified by slug.
   * Returns null if the parent product is not found.
   */
  async getVariantsForSlug(slug: string): Promise<ProductVariant[] | null> {
    const raw = await this.repo.findProductBySlug(slug);
    if (!raw) return null;

    const rawVariants = await this.repo.findVariantsByProductId(raw.id);
    return rawVariants.map(mapVariant);
  }

  // ── Categories ────────────────────────────────────────────────────────

  async getCategories(): Promise<Category[]> {
    const rows = await this.repo.findAllCategories();
    return rows as Category[];
  }

  // ── Brands ───────────────────────────────────────────────────────────

  async getBrands(): Promise<Brand[]> {
    const rows = await this.repo.findAllBrands();
    // Omit normalized_name from the public API response (internal use only)
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      logo_url: r.logo_url ?? null,
      created_at: r.created_at,
    })) as Brand[];
  }

  /**
   * Aggregate all store offers for a product across all its active variants.
   *
   * Returns an OffersResponse with:
   * - offers sorted by price ascending (in-stock first)
   * - lowest_price: lowest in-stock price or null
   * - store_count: distinct stores with any price offer
   * - has_multi_store: true if 2+ distinct stores offer this product
   *
   * No forced matches. All data is directly from the DB.
   */
  async getMultiStoreOffers(slug: string, requestedVariantId?: string): Promise<OffersResponse | null> {
    const raw = await this.repo.findMultiStoreOffers(slug);
    if (!raw) return null;

    const activeVariants = ((raw.variants || []) as any[]).filter((v) => v.is_active);
    if (activeVariants.length === 0) return null;

    // Variant Safety: Never compare different variants (e.g. 8GB/128GB vs 8GB/256GB) as one offer set.
    // If an explicit variant_id is requested, find it. Otherwise, select the canonical default variant.
    let targetVariant = activeVariants[0];
    if (requestedVariantId) {
      const matched = activeVariants.find((v) => v.id === requestedVariantId);
      if (matched) targetVariant = matched;
    } else if (activeVariants.length > 1) {
      // Deterministically pick canonical variant: lowest listed price, earliest created_at, ID tiebreaker
      const sorted = [...activeVariants].sort((a, b) => {
        const getMin = (v: any) => {
          const prices = (v.prices || []).map((p: any) => p.price).filter((p: any) => p != null);
          return prices.length > 0 ? Math.min(...prices) : Infinity;
        };
        const minA = getMin(a);
        const minB = getMin(b);
        if (minA !== minB) return minA - minB;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
      targetVariant = sorted[0];
    }

    // Build human-readable variant label for the target variant
    const specs: string[] = [];
    if (targetVariant.ram_gb) specs.push(`${targetVariant.ram_gb}GB RAM`);
    if (targetVariant.storage_gb) {
      specs.push(
        targetVariant.storage_gb >= 1024
          ? `${targetVariant.storage_gb / 1024}TB Storage`
          : `${targetVariant.storage_gb}GB Storage`
      );
    }
    if (targetVariant.color) specs.push(targetVariant.color);
    const variantName = specs.length > 0 ? specs.join(' · ') : (targetVariant.name || 'Standard');

    const offers: MultiStoreOffer[] = [];
    const storeIds = new Set<string>();

    for (const price of (targetVariant.prices || []) as any[]) {
      if (!price.store) continue; // Skip orphaned prices without store metadata
      storeIds.add(price.store_id);

      offers.push({
        variant_id: targetVariant.id,
        variant_name: variantName,
        store_id: price.store_id,
        store: {
          id: price.store.id,
          name: price.store.name,
          slug: price.store.slug,
          logo_url: price.store.logo_url ?? null,
          base_url: price.store.base_url,
        },
        price: price.price,
        original_price: price.original_price ?? null,
        discount_percent: price.discount_percent ?? null,
        in_stock: price.in_stock,
        stock_count: price.stock_count ?? null,
        product_url: price.product_url ?? null,
        last_scraped_at: price.last_scraped_at,
        availability_status: deriveAvailabilityStatus(price.in_stock, price.last_scraped_at, 72),
      });
    }

    // Sort: 
    // 1. Fresh in-stock first (availability_status === 'in_stock') sorted by price ASC
    // 2. Stale in-stock next (availability_status === 'stale' && in_stock) sorted by price ASC
    // 3. Out-of-stock / unknown last sorted by price ASC
    offers.sort((a, b) => {
      const statusA = a.availability_status;
      const statusB = b.availability_status;

      const rankA = statusA === 'in_stock' ? 0 : (statusA === 'stale' && a.in_stock) ? 1 : a.in_stock ? 2 : 3;
      const rankB = statusB === 'in_stock' ? 0 : (statusB === 'stale' && b.in_stock) ? 1 : b.in_stock ? 2 : 3;

      if (rankA !== rankB) return rankA - rankB;
      return a.price - b.price;
    });

    // Phase 5: Choose Best Price only from fresh eligible in-stock offers with valid URLs.
    // Never promote stale, out-of-stock, ambiguous or fabricated offers to Best Price.
    const freshEligiblePrices = offers
      .filter((o) => o.price > 0 && o.availability_status === 'in_stock' && o.product_url)
      .map((o) => o.price);

    const lowest_price = freshEligiblePrices.length > 0
      ? Math.min(...freshEligiblePrices)
      : null;

    return {
      success: true,
      product_slug: slug,
      variant_id: targetVariant.id,
      variant_name: variantName,
      lowest_price,
      store_count: storeIds.size,
      has_multi_store: storeIds.size >= 2,
      offers,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Row mappers
// ────────────────────────────────────────────────────────────────────────────

function getEligibleLowestPrice(prices: any[]): { lowestPrice: number | null; highestPrice: number | null } {
  if (!prices || !Array.isArray(prices) || prices.length === 0) {
    return { lowestPrice: null, highestPrice: null };
  }

  const valid = prices.filter((p) => p && typeof p.price === 'number' && p.price > 0);
  if (valid.length === 0) {
    return { lowestPrice: null, highestPrice: null };
  }

  const highestPrice = Math.max(...valid.map((p) => p.price));

  const freshInStock: number[] = [];
  const staleInStock: number[] = [];
  const otherInStock: number[] = [];
  const allPrices: number[] = [];

  for (const p of valid) {
    allPrices.push(p.price);
    const status = deriveAvailabilityStatus(p.in_stock, p.last_scraped_at, 72);
    if (status === 'in_stock') {
      freshInStock.push(p.price);
    } else if (status === 'stale' && p.in_stock === true) {
      staleInStock.push(p.price);
    } else if (p.in_stock === true) {
      otherInStock.push(p.price);
    }
  }

  let lowestPrice: number | null = null;
  if (freshInStock.length > 0) {
    lowestPrice = Math.min(...freshInStock);
  } else if (staleInStock.length > 0) {
    lowestPrice = Math.min(...staleInStock);
  } else if (otherInStock.length > 0) {
    lowestPrice = Math.min(...otherInStock);
  } else {
    lowestPrice = Math.min(...allPrices);
  }

  return { lowestPrice, highestPrice };
}

function mapProduct(raw: any): ProductWithRelations {
  let lowest_price: number | null = null;
  let highest_price: number | null = null;
  const storeIds = new Set<string>();
  
  let default_variant_id: string | null = null;

  if (raw.variants && Array.isArray(raw.variants) && raw.variants.length > 0) {
    // Deterministic selection of default variant:
    // 1. Variant offering lowest eligible price (aligns with "From Rs. X" on card)
    // 2. Earliest created_at timestamp
    // 3. Ascending UUID string tiebreaker
    const sortedVariants = [...raw.variants].sort((a: any, b: any) => {
      const { lowestPrice: minA } = getEligibleLowestPrice(a.prices || []);
      const { lowestPrice: minB } = getEligibleLowestPrice(b.prices || []);

      if (minA !== null && minB !== null && minA !== minB) {
        return minA - minB;
      }
      if (minA !== null && minB === null) return -1;
      if (minA === null && minB !== null) return 1;

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;

      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    default_variant_id = sortedVariants[0]?.id ?? null;

    const allPrices: any[] = [];
    for (const v of raw.variants) {
      if (v.prices && Array.isArray(v.prices)) {
        for (const p of v.prices) {
          allPrices.push(p);
          if (p.store_id) storeIds.add(p.store_id);
        }
      }
    }
    const { lowestPrice: eligibleLowest, highestPrice: eligibleHighest } = getEligibleLowestPrice(allPrices);
    lowest_price = eligibleLowest;
    highest_price = eligibleHighest;
  }

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    brand_id: raw.brand_id,
    category_id: raw.category_id,
    description: raw.description,
    image_url: raw.image_url,
    is_active: raw.is_active,
    normalized_name: raw.normalized_name,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    brand: raw.brand
      ? {
          id: raw.brand.id,
          name: raw.brand.name,
          slug: raw.brand.slug,
          logo_url: raw.brand.logo_url ?? null,
        }
      : null,
    category: raw.category
      ? {
          id: raw.category.id,
          name: raw.category.name,
          slug: raw.category.slug,
          parent_id: raw.category.parent_id,
        }
      : null,
    variant_count: raw.variants ? raw.variants.length : 0,
    default_variant_id,
    lowest_price,
    highest_price,
    store_count: storeIds.size,
  };
}

function mapVariant(raw: {
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
}): ProductVariant {
  return {
    id: raw.id,
    product_id: raw.product_id,
    name: raw.name,
    ram_gb: raw.ram_gb,
    storage_gb: raw.storage_gb,
    color: raw.color,
    model_number: raw.model_number,
    image_url: raw.image_url,
    is_active: raw.is_active,
    sku: raw.sku,
    gtin: raw.gtin,
    normalized_name: raw.normalized_name,
    source_identifier: raw.source_identifier,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Increment 6H — Search Relevance & Variant-Aware Scoring
// ────────────────────────────────────────────────────────────────────────────

interface QuerySpecs {
  storageGb?: number;
  ramGb?: number;
  sizeMm?: number;
}

function parseQuerySpecs(q: string): QuerySpecs {
  const specs: QuerySpecs = {};

  // Storage: e.g. 256GB, 512GB, 1TB
  const tbMatch = q.match(/\b(\d+)\s*tb\b/i);
  if (tbMatch) {
    specs.storageGb = parseInt(tbMatch[1], 10) * 1024;
  } else {
    const gbMatch = q.match(/\b(\d+)\s*gb(?!\s*ram)\b/i);
    if (gbMatch) {
      specs.storageGb = parseInt(gbMatch[1], 10);
    }
  }

  // RAM: e.g. 8GB RAM or 8GB
  const ramMatch = q.match(/\b(\d+)\s*(?:gb)?\s*ram\b/i);
  if (ramMatch) {
    specs.ramGb = parseInt(ramMatch[1], 10);
  }

  // Size: e.g. 40mm, 46mm
  const sizeMatch = q.match(/\b(\d{2})\s*mm\b/i);
  if (sizeMatch) {
    specs.sizeMm = parseInt(sizeMatch[1], 10);
  }

  return specs;
}

const MODEL_DISCRIMINATORS = new Set([
  'max',
  'plus',
  'ultra',
  'mini',
  'classic',
  'pro',
  'lite',
  'fe',
  'se',
  'active',
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateRelevanceScore(
  product: ProductWithRelations,
  raw: any,
  query: string
): number {
  const qNorm = normalizeText(query);
  const pNorm = normalizeText(product.normalized_name || product.name);
  const qTokens = qNorm.split(' ').filter(Boolean);
  const pTokens = pNorm.split(' ').filter(Boolean);

  if (qTokens.length === 0) return 0;

  const pTokenSet = new Set(pTokens);

  // Discriminators present in query
  const qDiscriminators = new Set(qTokens.filter((t) => MODEL_DISCRIMINATORS.has(t)));
  // Discriminators present in product name that were NOT in the query
  const unrequestedDiscriminators = pTokens.filter(
    (t) => MODEL_DISCRIMINATORS.has(t) && !qDiscriminators.has(t)
  );

  let baseScore = 0;

  // Tier 1: Exact full normalized match (or brand-stripped match)
  const brandNameNorm = product.brand?.name ? normalizeText(product.brand.name) : '';
  const pNormWithoutBrand =
    brandNameNorm && pNorm.startsWith(brandNameNorm)
      ? pNorm.slice(brandNameNorm.length).trim()
      : pNorm;

  if (pNorm === qNorm || pNormWithoutBrand === qNorm) {
    baseScore = 1000;
  }
  // Tier 2: Exact prefix match
  else if (pNorm.startsWith(qNorm) || pNormWithoutBrand.startsWith(qNorm)) {
    baseScore = 800;
  } else {
    // Check token coverage
    const matchedTokens = qTokens.filter((t) => pTokenSet.has(t));
    const allTokensMatched = matchedTokens.length === qTokens.length;

    if (allTokensMatched) {
      if (unrequestedDiscriminators.length === 0) {
        // Tier 3: All query tokens matched and NO unrequested discriminators
        baseScore = 650;
      } else {
        // Tier 4: All query tokens matched, but product has extra discriminator (e.g. Pro Max for "iPhone 17 Pro")
        baseScore = 500;
      }
    } else if (matchedTokens.length > 0) {
      // Tier 5: Partial token coverage: round(250 * matched / total)
      const ratio = matchedTokens.length / qTokens.length;
      baseScore = Math.round(250 * ratio);
    } else if (pNorm.includes(qNorm) || (qNorm.length >= 3 && pNorm.includes(qNorm.slice(0, 3)))) {
      // Tier 6: Substring match
      baseScore = 50;
    }
  }

  // ── Variant Spec Modifier (+150 / 0 / -200) ──────────────────────────
  let variantModifier = 0;
  const querySpecs = parseQuerySpecs(query);
  const hasRequestedSpecs =
    querySpecs.storageGb !== undefined ||
    querySpecs.ramGb !== undefined ||
    querySpecs.sizeMm !== undefined;

  if (hasRequestedSpecs && raw.variants && Array.isArray(raw.variants) && raw.variants.length > 0) {
    let hasExplicitMatch = false;
    let hasExplicitConflict = false;

    for (const v of raw.variants) {
      // Storage check
      if (querySpecs.storageGb !== undefined) {
        if (v.storage_gb === querySpecs.storageGb) {
          hasExplicitMatch = true;
        } else if (v.storage_gb !== null && v.storage_gb !== undefined) {
          hasExplicitConflict = true;
        } else if (v.name && v.name.includes(`${querySpecs.storageGb}`)) {
          hasExplicitMatch = true;
        }
      }

      // RAM check
      if (querySpecs.ramGb !== undefined) {
        if (v.ram_gb === querySpecs.ramGb) {
          hasExplicitMatch = true;
        } else if (v.ram_gb !== null && v.ram_gb !== undefined) {
          hasExplicitConflict = true;
        }
      }

      // Size check (e.g. 40mm vs 46mm)
      if (querySpecs.sizeMm !== undefined) {
        const sizeStr = `${querySpecs.sizeMm}mm`;
        const vNameNorm = normalizeText(v.name || '');
        const pNameNorm = pNorm;
        if (vNameNorm.includes(sizeStr) || pNameNorm.includes(sizeStr)) {
          hasExplicitMatch = true;
        } else {
          const conflictingSize = (vNameNorm + ' ' + pNameNorm).match(/\b(\d{2})mm\b/);
          if (conflictingSize && parseInt(conflictingSize[1], 10) !== querySpecs.sizeMm) {
            hasExplicitConflict = true;
          }
        }
      }
    }

    if (hasExplicitMatch) {
      variantModifier = 150;
    } else if (hasExplicitConflict) {
      variantModifier = -200;
    } else {
      variantModifier = 0; // NULL / unknown specs are not penalized
    }
  }

  // ── Multi-Store Boost (+10 * min(store_count, 5)) ───────────────────
  const storeCount = product.store_count ?? 0;
  const multiStoreBoost = Math.min(storeCount, 5) * 10;

  // ── In-Stock Boost (+20 / 0) ────────────────────────────────────────
  let hasInStock = false;
  if (raw.variants) {
    for (const v of raw.variants) {
      if (v.prices) {
        for (const p of v.prices) {
          if (p.in_stock) {
            hasInStock = true;
            break;
          }
        }
      }
      if (hasInStock) break;
    }
  }
  const inStockBoost = hasInStock ? 20 : 0;

  // ── Length Conciseness Penalty (-1 * min(extra_chars, 30)) ─────────
  const extraChars = Math.max(0, pNorm.length - qNorm.length);
  const lengthPenalty = -Math.min(extraChars, 30);

  return baseScore + variantModifier + multiStoreBoost + inStockBoost + lengthPenalty;
}
