import type { Metadata } from 'next';
import { Suspense } from 'react';
import { productService } from '@/services/productService';
import SearchPageClient from './SearchPageClient';
import type { Category, Brand } from '@/types';

/**
 * Search page — server component.
 *
 * Server side: fetches categories and brands for the filter sidebar.
 * Client side (SearchPageClient): fetches products based on URL params.
 *
 * SEO: canonical is /search without filter params to avoid duplicate pages.
 * Title reflects the search query if present.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q ?? '';

  return {
    title: q
      ? `Search results for "${q}" | PakPrice`
      : 'Browse Products | PakPrice',
    description: q
      ? `Compare prices for "${q}" across Pakistan's top online stores.`
      : "Browse and compare prices on electronics, appliances, and more across Pakistan's top stores.",
    // Canonical is always /search to avoid indexing filter combinations
    alternates: { canonical: '/search' },
    robots: {
      index: !q, // index browse page; noindex search result pages to avoid duplication
      follow: true,
    },
  };
}

import { unstable_cache } from 'next/cache';

/** Fetch categories and brands server-side for immediate sidebar render */
const getFilterData = unstable_cache(
  async (): Promise<{ categories: Category[]; brands: Brand[] }> => {
    try {
      const [categories, brands] = await Promise.all([
        productService.getCategories(),
        productService.getBrands(),
      ]);
      return { categories, brands };
    } catch {
      // If API is down, return empty arrays — page still renders with no filters
      return { categories: [], brands: [] };
    }
  },
  ['search-filter-data'],
  { revalidate: 3600 } // Cache for 1 hour
);

export default async function SearchPage() {
  const { categories, brands } = await getFilterData();

  return (
    <Suspense
      fallback={
        <div className="container-section py-8">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
      }
    >
      <SearchPageClient initialCategories={categories} initialBrands={brands} />
    </Suspense>
  );
}
