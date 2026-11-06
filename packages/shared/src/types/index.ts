/**
 * @pakprice/shared
 * Shared TypeScript types and interfaces used across web and api workspaces.
 */

// ============================================================
// STORE
// ============================================================

export interface Store {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  /** Absolute HTTPS URL to the store's logo. Null if not available. */
  logo_url: string | null;
  /** Short key identifying the scraper module for this store (e.g. "daraz", "priceoye") */
  scraper_key: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CATEGORY
// ============================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  /** Absolute HTTPS URL to category icon. Null if not available. */
  icon_url: string | null;
  sort_order: number;
  created_at: string;
}

// ============================================================
// BRAND
// ============================================================

export interface Brand {
  id: string;
  name: string;
  slug: string;
  /** Absolute HTTPS URL to brand logo. Null if not available. */
  logo_url: string | null;
  created_at: string;
}

// ============================================================
// PRODUCT (model/family level)
// A product is the model family, e.g. "Samsung Galaxy A56".
// Specific purchasable configurations are in ProductVariant.
// ============================================================

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  category_id: string | null;
  description: string | null;
  /**
   * Absolute HTTPS URL to the product image.
   * Null means no image — frontend must show a placeholder.
   * Used as fallback when a variant has no image of its own.
   */
  image_url: string | null;
  /** Normalised product name for dedup/matching. Added in migration 004. */
  normalized_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PRODUCT VARIANT (exact purchasable configuration)
// Each variant is a unique combination of product + specs.
// Example: Samsung Galaxy A56 — 8GB / 128GB / Awesome Navy
// ============================================================

export interface ProductVariant {
  id: string;
  product_id: string;
  /** Human-readable label, e.g. "8GB / 128GB / Black" */
  name: string;
  /** RAM in gigabytes. Null for non-RAM products (e.g. appliances). */
  ram_gb: number | null;
  /** Storage in gigabytes. Null for products without onboard storage. */
  storage_gb: number | null;
  /** Color name, e.g. "Awesome Navy". Null if color is not applicable. */
  color: string | null;
  /** Store-agnostic model number, e.g. "SM-A566BLBDPAK" */
  model_number: string | null;
  /**
   * Absolute HTTPS URL to variant-specific image.
   * If null, fall back to the parent product's image_url.
   * Never display a broken or empty URL — always fall back or use placeholder.
   */
  image_url: string | null;
  is_active: boolean;
  /** Store-specific SKU. Added in migration 004 for Phase 3 scraping. */
  sku: string | null;
  /** Global Trade Item Number / EAN / UPC barcode. Added in migration 004. */
  gtin: string | null;
  /** Normalised variant label for deduplication. Added in migration 004. */
  normalized_name: string | null;
  /** Opaque scraper matching key. Added in migration 004. */
  source_identifier: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PRICE (current price for a variant at a specific store)
// ============================================================

export interface Price {
  id: string;
  variant_id: string;
  store_id: string;
  /** Listed sale price in PKR */
  price: number;
  /** Original/MRP price before discount. Null if not available. */
  original_price: number | null;
  /** Calculated discount percentage. Null if no original price. */
  discount_percent: number | null;
  /** Shipping fee in PKR. 0 means free shipping. */
  shipping_fee: number;
  /** Minimum order value for free shipping. Null if always paid. */
  min_order_free_shipping: number | null;
  /** Discount from applicable coupons, in PKR */
  coupon_discount: number;
  /** Discount from bank/card offers, in PKR */
  bank_discount: number;
  /** Computed: price - coupon_discount - bank_discount */
  final_price: number;
  in_stock: boolean;
  stock_count: number | null;
  /** Direct URL to the product listing on the store */
  product_url: string | null;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PRICE HISTORY (append-only snapshots)
// ============================================================

export interface PriceHistory {
  id: string;
  variant_id: string;
  store_id: string;
  price: number;
  original_price: number | null;
  shipping_fee: number;
  in_stock: boolean;
  scraped_at: string;
}

// ============================================================
// STORE PRODUCT IDENTIFIER
// Maps a variant to a store-specific identifier for Phase 3 scraping.
// ============================================================

export interface StoreProductIdentifier {
  id: string;
  variant_id: string;
  store_id: string;
  identifier: string;
  /** e.g. 'sku', 'url_slug', 'product_id', 'barcode', 'asin' */
  identifier_type: string;
  created_at: string;
}

// ============================================================
// API RESPONSE ENVELOPES
// ============================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: any;
}

export interface ApiErrorResponse {
  success: false;
  error: string | ApiErrorDetail;
  message: string;
  statusCode: number;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================
// PHASE 2: EXTENDED TYPES
// ============================================================

// ── Extended brand (with normalized_name from migration 004) ──

export interface BrandWithNormalized extends Brand {
  /** Lowercase normalized brand name for dedup/matching (internal use) */
  normalized_name: string | null;
}

// ── Product with joined relations ────────────────────────────

/**
 * Product row with brand and category joined in a single query.
 * Returned by GET /api/v1/products and GET /api/v1/search.
 */
export interface ProductWithRelations extends Product {
  /** Lowercase normalized product name for fuzzy matching */
  normalized_name: string | null;
  /** Joined brand row. Null if brand_id is null. */
  brand: Pick<Brand, 'id' | 'name' | 'slug' | 'logo_url'> | null;
  /** Joined category row. Null if category_id is null. */
  category: Pick<Category, 'id' | 'name' | 'slug' | 'parent_id'> | null;
  
  // Phase 3 & 6H extensions
  variant_count?: number;
  default_variant_id?: string | null;
  lowest_price?: number | null;
  highest_price?: number | null;
  store_count?: number;
  relevance_score?: number;
}

// ── Category with child categories ───────────────────────────

export interface CategoryWithChildren extends Category {
  children: Category[];
}

// ── Variant with prices (Phase 3) ────────────────────────────

export interface ProductVariantWithPrices extends ProductVariant {
  /** Current prices from all stores. Empty array in Phase 2. */
  prices: Price[];
}

// ── Pagination ────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── Paginated list response ───────────────────────────────────

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: Pagination;
}

export interface CompareProduct extends ProductWithRelations {
  variants: ProductVariantWithPrices[];
}

export interface CompareResponse {
  products: CompareProduct[];
  missingSlugs: string[];
}

// ── Multi-store offers response (GET /api/v1/products/:slug/offers) ─────────

/**
 * A single store's price offer for a specific product variant.
 * Used by the /offers endpoint to aggregate cross-store pricing.
 */
export interface MultiStoreOffer {
  variant_id: string;
  /** Human-readable label for the variant (e.g. "8GB RAM · 256GB Storage · Black") */
  variant_name: string;
  store_id: string;
  store: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    base_url: string;
  };
  price: number;
  original_price: number | null;
  discount_percent: number | null;
  in_stock: boolean;
  stock_count: number | null;
  product_url: string | null;
  last_scraped_at: string;
  availability_status?: 'in_stock' | 'out_of_stock' | 'stale' | 'unknown';
}

/**
 * Response shape for GET /api/v1/products/:slug/offers.
 * Aggregates all store offers across all variants for a product,
 * sorted by price ascending.
 */
export interface OffersResponse {
  success: true;
  product_slug: string;
  /** ID of the compared variant */
  variant_id?: string;
  /** Human-readable name of the compared variant (e.g. "8GB RAM · 128GB Storage") */
  variant_name?: string;
  /** Lowest listed price across all in-stock offers. Null if no in-stock offers. */
  lowest_price: number | null;
  /** Number of distinct stores offering this product. */
  store_count: number;
  /** True when 2 or more distinct stores offer this product. */
  has_multi_store: boolean;
  offers: MultiStoreOffer[];
}

export type ProductListResponse = PaginatedResponse<ProductWithRelations>;

// ── Product detail response ───────────────────────────────────

export interface ProductDetailResponse {
  success: true;
  data: {
    product: ProductWithRelations;
    variants: ProductVariant[];
    /** Empty in Phase 2 — populated by Phase 3 scrapers. */
    prices: Price[];
  };
}


// ── Search ────────────────────────────────────────────────────

export type SearchSortOption = 'relevance' | 'price_asc' | 'store_count_desc' | 'name_asc' | 'name_desc' | 'newest';

export interface SearchParams {
  /** Partial, case-insensitive search term */
  q?: string;
  /** Category slug filter */
  category?: string;
  /** Brand slug filter */
  brand?: string;
  /** Minimum eligible price in PKR */
  minPrice?: number;
  /** Maximum eligible price in PKR */
  maxPrice?: number;
  /** Store slug filter (e.g. 'priceoye', 'megapk', 'shophive') */
  store?: string;
  /** Only show products currently in stock */
  inStock?: boolean;
  /** Minimum verified store count (e.g. 2 for multi-store only) */
  minStores?: number;
  /** Page number, 1-indexed */
  page?: number;
  /** Results per page, max 100 */
  limit?: number;
  /** Sort order */
  sort?: SearchSortOption;
}

/** Lightweight search suggestion for autocomplete dropdowns */
export interface SearchSuggestion {
  id: string;
  name: string;
  slug: string;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  thumbnail: string | null;
}

export interface SearchSuggestionsResponse {
  success: true;
  data: SearchSuggestion[];
}

/** Search results use the same paginated structure as product lists */
export type SearchResult = ProductListResponse;

// ============================================================
// PHASE 3: SCRAPING TYPES
// ============================================================

export interface ScrapedProduct {
  storeSlug: string;
  sourceUrl: string;
  sourceIdentifier: string;
  sourceIdentifierType: 'sku' | 'url_slug' | 'product_id' | 'barcode' | 'asin';
  name: string;
  brand?: string | null;
  modelNumber?: string | null;
  sku?: string | null;
  gtin?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  shippingFee?: number | null;
  inStock: boolean;
  stockCount?: number | null;
  ramGb?: number | null;
  storageGb?: number | null;
  color?: string | null;
}

export type ScrapeJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScrapeJob {
  id: string;
  store_id: string | null;
  status: ScrapeJobStatus;
  started_at: string | null;
  completed_at: string | null;
  products_scraped: number;
  errors_count: number;
  triggered_by: 'system' | 'admin' | 'cron' | 'manual';
  created_at: string;
}

export interface ScrapeLog {
  id: string;
  job_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface ProductPriceSummary {
  lowestPrice: number | null;
  highestPrice: number | null;
  storeCount: number;
}

// ============================================================
// PHASE 4: USER & INTELLIGENCE TYPES
// ============================================================

// ── Auth ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

// ── User Profile ─────────────────────────────────────────────

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Favorite ─────────────────────────────────────────────────
// favorites.variant_id references product_variants(id)

export interface Favorite {
  id: string;
  user_id: string;
  variant_id: string;
  created_at: string;
}

/** Favorite with joined product/variant data for display */
export interface FavoriteWithProduct extends Favorite {
  variant: ProductVariant | null;
  product: Pick<Product, 'id' | 'name' | 'slug' | 'image_url'> | null;
  lowest_price?: number | null;
  source_store?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
  in_stock?: boolean;
}

// ── Price Alert ──────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  user_id: string;
  variant_id: string;
  target_price: number;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface PriceAlertWithProduct extends PriceAlert {
  variant: ProductVariant | null;
  product: Pick<Product, 'id' | 'name' | 'slug' | 'image_url'> | null;
}

// ── Price History ────────────────────────────────────────────

export interface PriceHistoryPoint {
  date: string;
  price: number;
  storeId: string;
  storeName?: string;
}

export interface PriceHistoryResponse {
  success: true;
  data: {
    range: string;
    points: PriceHistoryPoint[];
    lowestPrice: number | null;
    highestPrice: number | null;
    currentLowestPrice: number | null;
    scope?: {
      variantId?: string | null;
      storeId?: string | null;
      storeName?: string | null;
    };
  };
}

// ── Coupon ────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  store_id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order: number | null;
  max_discount: number | null;
  url: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Bank Offer ───────────────────────────────────────────────

export interface BankOffer {
  id: string;
  store_id: string;
  bank_name: string;
  card_type: string | null;
  discount_percent: number | null;
  cashback_percent: number | null;
  min_purchase: number | null;
  max_discount: number | null;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Store Offer (composed for product detail) ────────────────

export interface StoreOffer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  variantId: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  shippingFee: number;
  finalPrice: number;
  inStock: boolean;
  stockCount: number | null;
  productUrl: string | null;
  lastScrapedAt: string | null;
}

// ── Final Price Breakdown ────────────────────────────────────

export interface AvailableOfferItem {
  type: 'coupon' | 'bank_offer';
  title: string;
  code?: string;
  discountAmount: number;
  condition?: string;
  isApplied: boolean;
}

export interface FinalPriceBreakdown {
  basePrice: number;
  shippingFee: number;
  guaranteedPrice: number;
  couponDiscount: number;
  bankDiscount: number;
  finalPrice: number;
  /** True when discounts depend on conditions (coupon code, bank, card) */
  isEstimated: boolean;
  appliedCoupon: string | null;
  appliedBankOffer: string | null;
  availableOffers: AvailableOfferItem[];
}

// ============================================================
// PHASE 5B: MATCHING TYPES
// ============================================================

export type MatchStatus = 'matched' | 'ambiguous' | 'no_match';

export type MatchMethod =
  | 'gtin'
  | 'store_identifier'
  | 'brand_model'
  | 'exact_specs'
  | 'strong_specs'
  | 'fuzzy';

export interface MatchCandidate {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  confidence: number;
  method: MatchMethod;
}

export interface MatchResult {
  status: MatchStatus;
  method: MatchMethod | null;
  confidence: number;
  product: Product | null;
  variant: ProductVariant | null;
  candidates: MatchCandidate[];
  reason: string;
}

// ============================================================
// PHASE 5F: OBSERVABILITY & ERROR TYPES
// ============================================================

export type ScrapeErrorCategory =
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'PARSE_ERROR'
  | 'ANTI_BOT'
  | 'RATE_LIMITED'
  | 'STORE_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'UNKNOWN';



