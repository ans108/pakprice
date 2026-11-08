import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { productService } from '@/services/productService';
import ProductDetailClient from './ProductDetailClient';
import ProductCard from '@/components/products/ProductCard';

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
    const brandName = product.brand?.name?.trim() ?? '';
    const shouldPrependBrand = brandName && !product.name.toLowerCase().startsWith(brandName.toLowerCase());
    const title = `${shouldPrependBrand ? `${brandName} ` : ''}${product.name} Price in Pakistan`;
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
      title: 'Product Not Found',
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

  // Fetch similar & recommended products (safe wrapped in try/catch so it never blocks page render)
  let similarProducts: any[] = [];
  try {
    const promises: Promise<any>[] = [];
    if (product.category?.slug) {
      promises.push(
        productService.getProducts({
          category: product.category.slug,
          sort: 'store_count_desc',
          limit: 10,
        })
      );
    }
    if (product.brand?.slug) {
      promises.push(
        productService.getProducts({
          brand: product.brand.slug,
          sort: 'store_count_desc',
          limit: 8,
        })
      );
    }

    const results = await Promise.all(promises);
    const seenIds = new Set<string>([product.id]);
    for (const res of results) {
      const items = Array.isArray(res?.data) ? res.data : (res?.data?.items || res?.data?.products || []);
      for (const item of items) {
        if (!seenIds.has(item.id) && item.slug !== product.slug) {
          seenIds.add(item.id);
          similarProducts.push(item);
        }
      }
    }
    similarProducts = similarProducts.slice(0, 8);
  } catch {
    similarProducts = [];
  }

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

      {/* ── Similar & Recommended Products Section ────────── */}
      {similarProducts.length > 0 && (
        <section className="mt-16 pt-10 border-t border-border" aria-label="Similar Products">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Recommended Matches
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Similar {product.category?.name || 'Products'} You May Like
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Top multi-store deals and popular alternatives in {product.category?.name || 'this category'}
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
              {product.category && (
                <Link
                  href={`/search?category=${product.category.slug}`}
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  View all {product.category.name}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              {product.brand && (
                <Link
                  href={`/search?brand=${product.brand.slug}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  More from {product.brand.name}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {similarProducts.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                variantCount={item.variant_count ?? item.variants?.length ?? 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Brand Explore Fallback ─────────────────────────── */}
      {product.brand && similarProducts.length === 0 && (
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
