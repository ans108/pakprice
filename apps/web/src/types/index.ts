/**
 * Web-layer type re-exports and any web-specific type extensions.
 * Shared types are sourced from @pakprice/shared.
 */
export type {
  // Phase 1
  Store,
  Product,
  Price,
  PriceHistory,
  StoreProductIdentifier,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  // Phase 2
  Category,
  CategoryWithChildren,
  Brand,
  BrandWithNormalized,
  ProductVariant,
  ProductVariantWithPrices,
  ProductWithRelations,
  Pagination,
  PaginatedResponse,
  ProductListResponse,
  ProductDetailResponse,
  CompareProduct,
  CompareResponse,
  MultiStoreOffer,
  OffersResponse,
  SearchParams,
  SearchResult,
  // Phase 4
  AuthUser,
  UserProfile,
  Favorite,
  FavoriteWithProduct,
  PriceAlert,
  PriceAlertWithProduct,
  PriceHistoryPoint,
  PriceHistoryResponse,
  Coupon,
  BankOffer,
  StoreOffer,
  FinalPriceBreakdown,
  // 6H
  SearchSuggestion,
  SearchSuggestionsResponse,
  SearchSortOption,
} from '@pakprice/shared';

