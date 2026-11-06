import { Metadata } from 'next';
import CompareClient from './CompareClient';
import { CompareResponse } from '@/types';

export const metadata: Metadata = {
  title: 'Compare Products | PakPrice',
  description: 'Compare product specifications, features, and prices side-by-side.',
};

async function getCompareData(slugs: string[]): Promise<CompareResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const url = `${apiUrl}/api/v1/products/compare?slugs=${slugs.join(',')}`;

  const res = await fetch(url, { next: { revalidate: 60 } });

  if (!res.ok) {
    // If the API returns 400 (e.g. >4 slugs), parse and rethrow the message
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.message || `Failed to fetch comparison data (${res.status})`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'Failed to fetch comparison data');
  }

  return json;
}

/**
 * Normalize and deduplicate slugs from the URL parameter.
 * Returns an array of unique, trimmed, non-empty slug strings.
 */
function parseSlugs(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ products?: string }>;
}) {
  const params = await searchParams;
  const productsParam = params.products;

  // No products parameter → empty state
  if (!productsParam) {
    return <CompareClient initialData={{ products: [], missingSlugs: [] }} />;
  }

  const slugs = parseSlugs(productsParam);

  // No valid slugs after parsing
  if (slugs.length === 0) {
    return <CompareClient initialData={{ products: [], missingSlugs: [] }} />;
  }

  // More than 4 unique slugs → show validation error
  if (slugs.length > 4) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Too Many Products</h1>
        <p className="text-muted-foreground mb-2">
          You can compare a maximum of 4 products at a time.
        </p>
        <p className="text-sm text-muted-foreground">
          You requested {slugs.length} products. Please remove some and try again.
        </p>
      </div>
    );
  }

  try {
    const data = await getCompareData(slugs);
    return <CompareClient initialData={data} />;
  } catch (error: any) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Comparison Error</h1>
        <p className="text-muted-foreground">
          {error.message || 'Could not load comparison data. Please try again.'}
        </p>
      </div>
    );
  }
}
