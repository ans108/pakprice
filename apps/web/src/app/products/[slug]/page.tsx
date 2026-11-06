import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { productService } from '@/services/productService';
import ProductDetailClient from './ProductDetailClient';

const getCachedProduct = cache(async (slug: string) => {
  return await productService.getProduct(slug);
});

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Product detail page — server component.
 *
 * - Fetches product + variants server-side
 * - Returns notFound() for missing/inactive products (clean 404)
 * - Generates dynamic metadata: "{Brand} {Name} Price in Pakistan | PakPrice"
 * - Passes data to ProductDetailClient for interactive variant selection
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const result = await getCachedProduct(slug);
    const { product } = result.data;
    const brandName = product.brand?.name ?? '';
    const title = `${brandName ? `${brandName} ` : ''}${product.name} Price in Pakistan | PakPrice`;
    const description = product.description
      ? product.description.slice(0, 160)
      : `Compare prices for ${product.name} across Pakistan's top online stores including Daraz, PriceOye, Telemart, and more.`;

    return {
      title,
      description,
      alternates: { canonical: `/products/${slug}` },
      openGraph: {
        title,
        description,
        url: `/products/${slug}`,
        images: product.image_url ? [{ url: product.image_url }] : [],
      },
    };
  } catch {
    return {
      title: 'Product Not Found | PakPrice',
    };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  let data: Awaited<ReturnType<typeof productService.getProduct>>;
  try {
    data = await getCachedProduct(slug);
  } catch (err: unknown) {
    // Axios normalises 404 into a rejection — call notFound() for clean 404 page
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404) notFound();
    // For other errors (5xx, network), also notFound() — never expose raw errors
    notFound();
  }

  const { product, variants } = data.data;

  return (
    <div className="container-section py-8">
      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <nav
        className="flex items-center gap-1 text-xs text-muted-foreground mb-6"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <Link href="/search" className="hover:text-foreground transition-colors">
          Products
        </Link>
        {product.category && (
          <>
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
            <Link
              href={`/search?category=${product.category.slug}`}
              className="hover:text-foreground transition-colors"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-foreground truncate max-w-[200px]" aria-current="page">
          {product.name}
        </span>
      </nav>

      {/* ── Product detail ─────────────────────────────────── */}
      <ProductDetailClient product={product} variants={variants as any} />

      {/* ── Related navigation ─────────────────────────────── */}
      {product.brand && (
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Browse more{' '}
            <Link
              href={`/search?brand=${product.brand.slug}`}
              className="text-primary hover:underline font-medium"
            >
              {product.brand.name}
            </Link>{' '}
            products.
          </p>
        </div>
      )}
    </div>
  );
}
