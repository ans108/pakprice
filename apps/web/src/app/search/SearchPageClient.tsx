'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, PackageSearch, AlertCircle, Sparkles, Loader2, X } from 'lucide-react';
import type { ProductWithRelations, Category, Brand, Pagination, SearchSortOption } from '@/types';
import { productService } from '@/services/productService';
import ProductCard from '@/components/products/ProductCard';
import FilterSidebar from '@/components/search/FilterSidebar';
import SortSelect from '@/components/search/SortSelect';
import ActiveFilters from '@/components/search/ActiveFilters';
import { ProductCardSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SearchPageClientProps {
  initialCategories: Category[];
  initialBrands: Brand[];
}

/**
 * Increment 6H SearchPageClient — interactive search discovery & catalog navigation.
 * URL is the single source of truth for query, filters, sorting, and pagination.
 */
export default function SearchPageClient({
  initialCategories,
  initialBrands,
}: SearchPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Read state from URL ──────────────────────────────────────
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const brand = searchParams.get('brand') ?? '';
  const store = searchParams.get('store') ?? '';
  const minPriceRaw = searchParams.get('minPrice');
  const maxPriceRaw = searchParams.get('maxPrice');
  const minPrice = minPriceRaw ? parseInt(minPriceRaw, 10) : undefined;
  const maxPrice = maxPriceRaw ? parseInt(maxPriceRaw, 10) : undefined;
  const inStockOnly = searchParams.get('inStock') === 'true';
  const minStoresRaw = searchParams.get('minStores');
  const minStores = minStoresRaw ? parseInt(minStoresRaw, 10) : undefined;
  const sort = (searchParams.get('sort') ?? 'relevance') as SearchSortOption;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  // ── Debounced Search Input state ─────────────────────────────
  const [searchInput, setSearchInput] = useState(q);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync search input when q changes externally
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // ── Data state ───────────────────────────────────────────────
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastRecordedQueryRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Fetch products whenever URL params change ─────────────────
  const fetchProducts = useCallback(async () => {
    // Abort previous in-flight request so obsolete queries cannot overwrite newer results
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await productService.search(
        {
          q,
          category,
          brand,
          store,
          minPrice,
          maxPrice,
          inStock: inStockOnly || undefined,
          minStores,
          sort,
          page,
          limit: 12,
        },
        controller.signal
      );

      // Only update state if this request wasn't superseded
      if (!controller.signal.aborted) {
        setProducts(result.data);
        setPagination(result.pagination);

        // Save search history if there's a non-empty query, on page 1, deduplicated
        const normalizedQ = q.trim().replace(/\s+/g, ' ');
        if (normalizedQ && page === 1 && lastRecordedQueryRef.current !== normalizedQ) {
          lastRecordedQueryRef.current = normalizedQ;
          import('@/lib/axios').then(({ default: apiClient }) => {
            apiClient
              .post('/api/v1/search-history', {
                query: normalizedQ,
                resultCount: result.pagination.total,
              })
              .catch(() => {});
          });
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      setError('Unable to load products. Please check your connection and try again.');
      setProducts([]);
      setPagination(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [q, category, brand, store, minPrice, maxPrice, inStockOnly, minStores, sort, page]);

  useEffect(() => {
    fetchProducts();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProducts]);

  // ── URL update helpers ───────────────────────────────────────
  const updateURL = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      // Reset to page 1 whenever filters/sort change
      if (!('page' in updates)) params.delete('page');
      router.push(`/search?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSearchInputChange = (val: string) => {
    setSearchInput(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      updateURL({ q: val.trim() });
    }, 300);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    updateURL({ q: searchInput.trim() });
  };

  const handleClearSearch = () => {
    setSearchInput('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    updateURL({ q: '' });
  };

  const handleCategoryChange = (slug: string) => updateURL({ category: slug });
  const handleBrandChange = (slug: string) => updateURL({ brand: slug });
  const handleStoreChange = (slug: string) => updateURL({ store: slug });
  const handlePriceChange = (min?: number, max?: number) =>
    updateURL({
      minPrice: min !== undefined ? String(min) : '',
      maxPrice: max !== undefined ? String(max) : '',
    });
  const handleInStockChange = (inStock?: boolean) =>
    updateURL({ inStock: inStock ? 'true' : '' });
  const handleMinStoresChange = (ms?: number) =>
    updateURL({ minStores: ms ? String(ms) : '' });
  const handleSortChange = (s: SearchSortOption) => updateURL({ sort: s });
  const handlePageChange = (p: number) => updateURL({ page: String(p) });
  const handleClearAll = () =>
    updateURL({
      q: '',
      category: '',
      brand: '',
      store: '',
      minPrice: '',
      maxPrice: '',
      inStock: '',
      minStores: '',
    });

  // ── Active filter chips ──────────────────────────────────────
  const activeFilters = [
    q && {
      label: `Search: "${q}"`,
      onRemove: handleClearSearch,
    },
    category && {
      label: `Category: ${initialCategories.find((c) => c.slug === category)?.name ?? category}`,
      onRemove: () => handleCategoryChange(''),
    },
    brand && {
      label: `Brand: ${initialBrands.find((b) => b.slug === brand)?.name ?? brand}`,
      onRemove: () => handleBrandChange(''),
    },
    store && {
      label: `Store: ${store}`,
      onRemove: () => handleStoreChange(''),
    },
    (minPrice !== undefined || maxPrice !== undefined) && {
      label: `Price: Rs. ${minPrice?.toLocaleString() ?? '0'} – ${maxPrice ? 'Rs. ' + maxPrice.toLocaleString() : 'Any'}`,
      onRemove: () => handlePriceChange(undefined, undefined),
    },
    inStockOnly && {
      label: 'In Stock Only',
      onRemove: () => handleInStockChange(false),
    },
    minStores === 2 && {
      label: '2+ Stores Found',
      onRemove: () => handleMinStoresChange(undefined),
    },
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;

  return (
    <div className="container-section py-8">
      {/* ── Page header & interactive debounced search bar ──── */}
      <div className="mb-6">
        <form onSubmit={handleSearchSubmit} className="relative max-w-xl w-full mb-4">
          <div className="flex items-center gap-2 p-1.5 pl-3 rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all">
            {loading ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" aria-hidden="true" />
            ) : (
              <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            )}
            <Input
              id="search-page-input"
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="Search 12+ stores for products, brands, or models..."
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm h-8 px-1"
              aria-label="Search catalog"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <Button type="submit" size="sm" className="h-8 px-3 text-xs shrink-0 rounded-lg">
              Search
            </Button>
          </div>
        </form>

        {q ? (
          <>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>Search results for</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground flex flex-wrap items-center gap-2">
              <span>&ldquo;{q}&rdquo;</span>
              {!loading && pagination && (
                <span className="text-base font-normal text-muted-foreground">
                  ({total.toLocaleString()} {total === 1 ? 'canonical product' : 'canonical products'})
                </span>
              )}
            </h1>
          </>
        ) : (
          <h1 className="text-2xl font-bold text-foreground">
            All Products
            {!loading && pagination && (
              <span className="ml-3 text-base font-normal text-muted-foreground">
                ({total.toLocaleString()} {total === 1 ? 'product' : 'products'})
              </span>
            )}
          </h1>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <FilterSidebar
          categories={initialCategories}
          brands={initialBrands}
          selectedCategory={category}
          selectedBrand={brand}
          selectedStore={store}
          minPrice={minPrice}
          maxPrice={maxPrice}
          inStockOnly={inStockOnly}
          minStores={minStores}
          onCategoryChange={handleCategoryChange}
          onBrandChange={handleBrandChange}
          onStoreChange={handleStoreChange}
          onPriceChange={handlePriceChange}
          onInStockChange={handleInStockChange}
          onMinStoresChange={handleMinStoresChange}
          onClearAll={handleClearAll}
        />

        {/* ── Main content ────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Controls row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <ActiveFilters filters={activeFilters} />
            <SortSelect value={sort} onChange={handleSortChange} className="sm:ml-auto" />
          </div>

          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive mb-6"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium text-sm">Something went wrong</p>
                <p className="text-sm mt-0.5 text-destructive/80">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={fetchProducts}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div>
              {/* Visible Searching indicator */}
              <div
                className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium animate-pulse"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" aria-hidden="true" />
                <span>Searching{q ? ` for "${q}"` : ' products'} across Pakistan&apos;s verified stores...</span>
              </div>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                aria-busy="true"
                aria-label="Loading products"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state — Increment 6H structured guidance */}
          {!loading && !error && products.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border bg-card/50">
              <PackageSearch
                className="w-16 h-16 text-muted-foreground/30 mb-4"
                aria-hidden="true"
              />
              <h2 className="text-lg font-bold text-foreground mb-1">
                No products found {q ? `for "${q}"` : ''}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                We couldn&apos;t find an exact match in our catalog for your search or filter combination.
              </p>

              {/* Discovery Tips */}
              <div className="text-left bg-muted/50 border border-border/60 rounded-xl p-4 max-w-md w-full mb-6">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Search suggestions</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>Try a shorter, broader product name (e.g. &ldquo;iPhone&rdquo; instead of &ldquo;iPhone 18 Ultra&rdquo;)</li>
                  <li>Search by brand + model (e.g. &ldquo;Samsung Galaxy Watch&rdquo;)</li>
                  <li>Remove specific storage or color terms from your query</li>
                  <li>Double check spelling or try common alternatives</li>
                </ul>
              </div>

              {activeFilters.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearAll}>
                  Clear all filters
                </Button>
              )}
            </div>
          )}

          {/* Product grid */}
          {!loading && !error && products.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    variantCount={product.variant_count ?? 0}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <nav
                  className="flex items-center justify-center gap-2 mt-8"
                  aria-label="Search results pagination"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {buildPageNumbers(page, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => handlePageChange(p as number)}
                          aria-label={`Page ${p}`}
                          aria-current={p === page ? 'page' : undefined}
                          className="min-w-[2rem]"
                        >
                          {p}
                        </Button>
                      )
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </nav>
              )}

              {/* Result count */}
              <p className="text-center text-xs text-muted-foreground mt-3">
                Showing {(page - 1) * 12 + 1}–{Math.min(page * 12, total)} of {total}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function buildPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
