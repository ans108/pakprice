'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Search, AlertCircle, Plus, Scale, Store, Trophy, TrendingDown } from 'lucide-react';
import { CompareResponse, CompareProduct } from '@/types';
import { useCompare } from '@/contexts/CompareContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export default function CompareClient({ initialData }: { initialData: CompareResponse }) {
  const router = useRouter();
  const { removeFromCompare } = useCompare();
  const { products, missingSlugs } = initialData;
  const [showOutOfStock, setShowOutOfStock] = useState(false);

  const removeProduct = (slugToRemove: string) => {
    try {
      removeFromCompare(slugToRemove);
    } catch {}
    const newSlugs = products.filter(p => p.slug !== slugToRemove).map(p => p.slug);
    if (newSlugs.length === 0) {
      router.push('/compare');
    } else {
      router.push(`/compare?products=${newSlugs.join(',')}`);
    }
  };

  // ── Helper: get distinct store count for a product ─────────────
  function getProductStoreCount(product: CompareProduct): number {
    const ids = new Set<string>();
    (product.variants || []).forEach((v: any) => {
      (v.prices || []).forEach((p: any) => { if (p.store_id) ids.add(p.store_id); });
    });
    return ids.size;
  }

  // ── Empty state ────────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-20 flex flex-col items-center justify-center text-center min-h-[50vh]">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6 text-muted-foreground">
          <Scale className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Nothing to Compare</h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          {missingSlugs && missingSlugs.length > 0
            ? `We couldn't find these products: ${missingSlugs.join(', ')}. Try browsing for other products.`
            : 'You haven\'t selected any products to compare yet. Add products to your comparison list while browsing.'
          }
        </p>
        <Button asChild>
          <Link href="/search">Browse Products</Link>
        </Button>
      </div>
    );
  }

  // ── Comparison table ───────────────────────────────────────────
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Compare Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comparing {products.length} product{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Out-of-stock toggle */}
          <button
            onClick={() => setShowOutOfStock(prev => !prev)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
              showOutOfStock
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/30 text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {showOutOfStock ? 'Showing all offers' : 'In-stock only'}
          </button>
          {products.length < 4 && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/search" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add another product
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Missing slugs warning */}
      {missingSlugs && missingSlugs.length > 0 && (
        <div className="mb-8 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-destructive">Some products couldn&apos;t be found</h3>
            <p className="text-xs text-destructive/80 mt-1">
              Could not find: {missingSlugs.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Comparison grid */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <table className="w-full text-sm text-left border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="w-40 p-4 bg-muted/30 border-b border-border sticky left-0 z-10 backdrop-blur-md"></th>
              {products.map((product) => {
                const storeCount = getProductStoreCount(product);
                return (
                  <th key={product.id} className="w-64 p-4 border-b border-l border-border align-top relative bg-card">
                    <button
                      onClick={() => removeProduct(product.slug)}
                      className="absolute top-2 right-2 p-1.5 bg-muted hover:bg-destructive hover:text-destructive-foreground text-muted-foreground rounded-full transition-colors"
                      aria-label={`Remove ${product.name} from comparison`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <Link href={`/products/${product.slug}`} className="block group">
                      <div className="relative w-full aspect-square bg-muted/30 rounded-lg mb-3 overflow-hidden">
                        <Image
                          src={product.image_url || '/placeholder.png'}
                          alt={product.name}
                          fill
                          className="object-contain p-4 group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="font-semibold text-base text-foreground group-hover:text-primary transition-colors line-clamp-2 pr-6">
                        {product.name}
                      </div>
                    </Link>
                    {/* Store count badge */}
                    {storeCount > 0 && (
                      <div className={cn(
                        "mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        storeCount >= 2
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "bg-muted/50 border-border text-muted-foreground"
                      )}>
                        <Store className="w-2.5 h-2.5" />
                        {storeCount === 1 ? '1 store' : `${storeCount} stores`}
                        {storeCount >= 2 && ' · Multi-store'}
                      </div>
                    )}
                  </th>
                );
              })}
              {/* Empty slot placeholders */}
              {products.length < 4 && (
                <th className="w-64 p-4 border-b border-l border-border bg-muted/5">
                  <Link
                    href="/search"
                    className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
                  >
                    <Plus className="w-8 h-8 mb-2" />
                    <span className="text-xs font-medium">Add Product</span>
                  </Link>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Brand */}
            <CompareRow label="Brand" products={products}>
              {(product) =>
                product.brand ? (
                  <span className="inline-flex items-center gap-2">
                    {product.brand.logo_url && (
                      <Image src={product.brand.logo_url} alt={product.brand.name} width={20} height={20} className="object-contain" />
                    )}
                    <span className="font-medium">{product.brand.name}</span>
                  </span>
                ) : <span className="text-muted-foreground">—</span>
              }
            </CompareRow>

            {/* Category */}
            <CompareRow label="Category" products={products}>
              {(product) =>
                product.category?.name
                  ? <span>{product.category.name}</span>
                  : <span className="text-muted-foreground">—</span>
              }
            </CompareRow>

            {/* Pricing & Configurations — variant-aware */}
            <tr>
              <td className="p-4 font-medium text-foreground bg-muted/30 border-b border-border sticky left-0 z-10 backdrop-blur-md align-top pt-6">
                Pricing &amp; Configurations
              </td>
              {products.map((product) => (
                <td key={product.id} className="p-4 border-b border-l border-border align-top bg-card pt-6">
                  <VariantPricing product={product} showOutOfStock={showOutOfStock} />
                </td>
              ))}
              {products.length < 4 && (
                <td className="p-4 border-b border-l border-border bg-muted/5"></td>
              )}
            </tr>

            {/* Model Numbers */}
            <CompareRow label="Model Numbers" products={products}>
              {(product) => {
                const variants = product.variants || [];
                const models = Array.from(new Set(
                  variants.filter((v: any) => v.is_active && v.model_number).map((v: any) => v.model_number)
                ));
                return models.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {models.map((m: any, i) => (
                      <span key={i} className="text-xs text-muted-foreground font-mono">{m}</span>
                    ))}
                  </div>
                ) : <span className="text-muted-foreground">—</span>;
              }}
            </CompareRow>

            {/* Store Availability */}
            <CompareRow label="Store Availability" products={products}>
              {(product) => {
                const storeIds = new Set<string>();
                (product.variants || []).forEach((v: any) => {
                  (v.prices || []).forEach((p: any) => {
                    if (p.in_stock && p.store_id) storeIds.add(p.store_id);
                  });
                });
                return storeIds.size > 0 ? (
                  <span className="text-sm font-medium">
                    {storeIds.size} store{storeIds.size !== 1 ? 's' : ''}
                  </span>
                ) : <span className="text-muted-foreground text-sm">No stores</span>;
              }}
            </CompareRow>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Reusable comparison row ─────────────────────────────────────
function CompareRow({
  label,
  products,
  children,
}: {
  label: string;
  products: CompareProduct[];
  children: (product: CompareProduct) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="p-4 font-medium text-foreground bg-muted/30 border-b border-border sticky left-0 z-10 backdrop-blur-md">
        {label}
      </td>
      {products.map((product) => (
        <td key={product.id} className="p-4 border-b border-l border-border bg-card">
          {children(product)}
        </td>
      ))}
      {products.length < 4 && (
        <td className="p-4 border-b border-l border-border bg-muted/5"></td>
      )}
    </tr>
  );
}

// ── Variant-aware pricing display ───────────────────────────────
function VariantPricing({ product, showOutOfStock }: { product: CompareProduct; showOutOfStock: boolean }) {
  const variants = (product.variants || []).filter((v: any) => v.is_active);

  if (variants.length === 0) {
    return <span className="text-muted-foreground text-sm">Price unavailable</span>;
  }

  return (
    <div className="flex flex-col gap-3">
      {variants.map((variant: any) => {
        const allPrices = (variant.prices || []).filter((p: any) => p.price != null);
        const prices = showOutOfStock ? allPrices : allPrices.filter((p: any) => p.in_stock);
        const lowestInStock = allPrices.filter((p: any) => p.in_stock);
        const lowestPrice = lowestInStock.length > 0
          ? Math.min(...lowestInStock.map((p: any) => p.price))
          : (allPrices.length > 0 ? Math.min(...allPrices.map((p: any) => p.price)) : null);
        const highestPrice = lowestInStock.length > 0
          ? Math.max(...lowestInStock.map((p: any) => p.price))
          : null;
        const savings = (highestPrice && lowestPrice && highestPrice > lowestPrice)
          ? highestPrice - lowestPrice
          : null;

        // Count distinct stores carrying this variant
        const variantStoreIds = new Set((variant.prices || []).filter((p: any) => p.store_id).map((p: any) => p.store_id));

        // Build spec string from actual fields
        const specs: string[] = [];
        if (variant.ram_gb) specs.push(`${variant.ram_gb}GB RAM`);
        if (variant.storage_gb) {
          specs.push(
            variant.storage_gb >= 1024
              ? `${variant.storage_gb / 1024}TB Storage`
              : `${variant.storage_gb}GB Storage`
          );
        }
        if (variant.color) specs.push(variant.color);
        const specString = specs.length > 0 ? specs.join(' · ') : variant.name || 'Standard';

        return (
          <div key={variant.id} className="flex flex-col gap-2 p-3 rounded-lg border border-border/50 bg-muted/10">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-xs font-semibold text-foreground">{specString}</span>
              {/* Multi-store indicator per variant */}
              {variantStoreIds.size >= 2 && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-primary uppercase tracking-wide">
                  <Store className="w-2.5 h-2.5" />
                  {variantStoreIds.size} stores
                </span>
              )}
            </div>
            {lowestPrice != null ? (
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {lowestInStock.length > 0 ? 'Lowest In-Stock Price' : 'Lowest Listed Price'}
                </span>
                <span className="text-base font-bold text-primary">
                  Rs. {lowestPrice.toLocaleString()}
                </span>
                {/* Savings indicator: shown when same product is cheaper at one store vs another */}
                {savings && savings > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 font-semibold mt-0.5">
                    <TrendingDown className="w-3 h-3" />
                    Save up to Rs. {savings.toLocaleString()} vs highest offer
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Price unavailable</span>
            )}

            {/* Individual Store Offers */}
            {prices.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5 border-t border-border/40 pt-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                  Store Offers ({prices.length})
                </span>
                <div className="flex flex-col gap-1">
                  {prices
                    .sort((a: any, b: any) => {
                      if (a.in_stock && !b.in_stock) return -1;
                      if (!a.in_stock && b.in_stock) return 1;
                      return a.price - b.price;
                    })
                    .map((price: any) => {
                      const isLowest = price.in_stock && price.price === lowestPrice && lowestInStock.length > 0;
                      return (
                        <div
                          key={price.id}
                          className={cn(
                            "flex items-center justify-between gap-2 p-1.5 rounded border text-xs",
                            isLowest
                              ? "bg-green-50 dark:bg-green-950/30 border-green-400/40"
                              : "bg-background/80 border-border/40"
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {price.store?.logo_url ? (
                              <div className="w-3.5 h-3.5 relative shrink-0">
                                <Image
                                  src={price.store.logo_url}
                                  alt={price.store.name || 'Store'}
                                  fill
                                  className="object-contain"
                                />
                              </div>
                            ) : null}
                            <span className="truncate font-medium text-foreground text-[11px]">
                              {price.store?.name || 'Store'}
                            </span>
                            {isLowest && (
                              <Trophy className="w-2.5 h-2.5 text-green-600 dark:text-green-400 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn(
                              "font-semibold text-[11px]",
                              isLowest ? "text-green-700 dark:text-green-400" : "text-foreground"
                            )}>
                              Rs. {price.price.toLocaleString()}
                            </span>
                            {price.product_url ? (
                              <a
                                href={price.product_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-medium text-primary hover:underline"
                              >
                                View
                              </a>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
