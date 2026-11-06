import apiClient from '@/lib/axios';
import type {
  Category,
  Brand,
  ProductListResponse,
  ProductDetailResponse,
  SearchParams,
  SearchSuggestion,
  SearchSuggestionsResponse,
} from '@/types';

/**
 * Product API service for the web frontend.
 * All functions return data or throw — callers handle loading/error states.
 * Uses the shared axios client which normalises network errors.
 */
export const productService = {
  /**
   * Fetch a paginated list of products with optional search/filters.
   */
  async getProducts(params: SearchParams = {}): Promise<ProductListResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<ProductListResponse>(
      `/api/v1/products${query}`
    );
    return response.data;
  },

  /**
   * Fetch a single product detail (with variants).
   * Throws if not found — caller should catch and redirect to 404.
   */
  async getProduct(slug: string): Promise<ProductDetailResponse> {
    const response = await apiClient.get<ProductDetailResponse>(
      `/api/v1/products/${encodeURIComponent(slug)}`
    );
    return response.data;
  },

  /**
   * Search products — uses the same underlying API as getProducts.
   * Kept as a named alias for clarity at call sites.
   */
  async search(params: SearchParams = {}, signal?: AbortSignal): Promise<ProductListResponse> {
    const query = buildQueryString(params);
    const response = await apiClient.get<ProductListResponse>(
      `/api/v1/search${query}`,
      { signal }
    );
    return response.data;
  },

  /**
   * Fetch lightweight search suggestions for autocomplete (<45ms).
   */
  async getSuggestions(q: string): Promise<SearchSuggestion[]> {
    if (!q || q.trim().length < 2) return [];
    const response = await apiClient.get<SearchSuggestionsResponse>(
      `/api/v1/search/suggestions?q=${encodeURIComponent(q.trim())}`
    );
    return response.data.data;
  },

  /**
   * Fetch all categories (for filter sidebar population).
   */
  async getCategories(): Promise<Category[]> {
    const response = await apiClient.get<{ success: true; data: Category[] }>(
      '/api/v1/categories'
    );
    return response.data.data;
  },

  /**
   * Fetch all brands (for filter sidebar population).
   */
  async getBrands(): Promise<Brand[]> {
    const response = await apiClient.get<{ success: true; data: Brand[] }>(
      '/api/v1/brands'
    );
    return response.data.data;
  },
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function buildQueryString(params: SearchParams): string {
  const p = new URLSearchParams();
  if (params.q) p.set('q', params.q);
  if (params.category) p.set('category', params.category);
  if (params.brand) p.set('brand', params.brand);
  if (params.minPrice !== undefined && params.minPrice !== null) p.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined && params.maxPrice !== null) p.set('maxPrice', String(params.maxPrice));
  if (params.store) p.set('store', params.store);
  if (params.inStock !== undefined && params.inStock !== null) p.set('inStock', String(params.inStock));
  if (params.minStores !== undefined && params.minStores !== null) p.set('minStores', String(params.minStores));
  if (params.page) p.set('page', String(params.page));
  if (params.limit) p.set('limit', String(params.limit));
  if (params.sort) p.set('sort', params.sort);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}
