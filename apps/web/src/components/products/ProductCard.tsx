import React from 'react';
import Link from 'next/link';
import { Tag, Layers, ArrowRight, Store } from 'lucide-react';
import type { ProductWithRelations } from '@/types';
import ProductImage from './ProductImage';
import { FavoriteButton } from './FavoriteButton';
import { cn } from '@/utils/cn';

interface ProductCardProps {
  product: ProductWithRelations;
  /** Total number of active variants for this product */
  variantCount?: number;
  className?: string;
}

/**
 * ProductCard — reusable grid card for canonical product discovery.
 *
 * Displays:
 *   - Product image (via ProductImage with safe fallback)
 *   - Brand name badge
 *   - Product name
 *   - Multi-store badge (e.g. "3 stores found")
 *   - Category chip (if available)
 *   - Variant count
 *   - Lowest eligible price ("From Rs. X") & store count
 *   - Favorite button
 *
 * Links to /products/[slug] to see all store-by-store prices.
 */
export default function ProductCard({ product, variantCount = 0, className }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn(
        'group flex flex-col rounded-2xl border border-border bg-card overflow-hidden',
        'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5',
        'transition-all duration-200',
        className
      )}
      aria-label={`View prices for ${product.name}`}
    >
      {/* Image area */}
      <div className="relative w-full aspect-square bg-muted/50 overflow-hidden">
        <ProductImage
          product={product}
          variant={null}
          fill
          className="group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
          <FavoriteButton variantId={product.default_variant_id} />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {/* Brand */}
        {product.brand && (
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {product.brand.name}
          </span>
        )}

        {/* Product name */}
        <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {product.name}
        </h3>

        {/* Category chip */}
        <div className="flex flex-wrap items-center gap-1.5">
          {product.category && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="w-3 h-3" aria-hidden="true" />
              <span>{product.category.name}</span>
            </div>
          )}
          {product.store_count && product.store_count > 1 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <Store className="w-3 h-3" />
              {product.store_count} stores
            </span>
          ) : null}
        </div>

        {/* Variants info */}
        {variantCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="w-3 h-3" aria-hidden="true" />
            <span>
              {variantCount} variant{variantCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Price state */}
        <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2 flex items-center justify-between">
          <div className="flex flex-col">
            {product.lowest_price ? (
              <>
                <span className="text-xs text-muted-foreground">From</span>
                <span className="text-base font-bold text-foreground">
                  Rs. {product.lowest_price.toLocaleString()}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Out of stock</span>
            )}
          </div>
          {product.store_count && product.store_count > 0 ? (
            <div className="text-xs text-muted-foreground text-right font-medium">
              {product.store_count} {product.store_count === 1 ? 'store' : 'stores'} found
            </div>
          ) : null}
        </div>

        {/* CTA row */}
        <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/40">
          <span className="text-xs text-primary font-semibold group-hover:underline">View store prices</span>
          <ArrowRight
            className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}
