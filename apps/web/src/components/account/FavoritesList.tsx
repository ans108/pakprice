'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2, Trash2, HeartCrack, Store, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/contexts/FavoritesContext';
import { cn } from '@/utils/cn';

export function FavoritesList() {
  const { favorites, loading, removeFavorite } = useFavorites();

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
        <HeartCrack className="w-14 h-14 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">No favorites yet</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Save products and configurations to your favorites to monitor prices across stores.
        </p>
        <Button asChild>
          <Link href="/search">Browse Products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">My Favorites</h2>
        <span className="text-xs text-muted-foreground">
          {favorites.length} {favorites.length === 1 ? 'item' : 'items'} saved
        </span>
      </div>

      <div className="divide-y divide-border">
        {favorites.map((fav) => {
          const product = fav.product;
          if (!product) return null;

          return (
            <div
              key={fav.id}
              className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
            >
              {/* Product info */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 bg-muted/30 rounded-xl border border-border shrink-0 flex items-center justify-center overflow-hidden p-1">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="object-contain w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted/50" />
                  )}
                </div>

                <div className="min-w-0">
                  <Link
                    href={`/products/${product.slug}`}
                    className="font-semibold text-sm text-foreground hover:text-primary transition-colors line-clamp-1"
                  >
                    {product.name}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Variant: <span className="font-medium text-foreground/80">{fav.variant?.name || 'Default'}</span>
                  </div>

                  {/* Store info */}
                  {fav.source_store && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <Store className="w-3 h-3 text-muted-foreground/70" />
                      <span>Best offer at <span className="font-medium text-foreground/90">{fav.source_store.name}</span></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Price & availability & actions */}
              <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pl-20 sm:pl-0">
                <div className="flex flex-col sm:items-end">
                  {fav.lowest_price !== null && fav.lowest_price !== undefined ? (
                    <>
                      <span className="text-xs text-muted-foreground">From</span>
                      <span className="text-base font-bold text-foreground">
                        Rs. {fav.lowest_price.toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">No current price</span>
                  )}

                  <span
                    className={cn(
                      'text-[10px] font-semibold mt-0.5',
                      fav.in_stock ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                    )}
                  >
                    {fav.in_stock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button asChild variant="outline" size="sm" className="h-8 px-3 text-xs">
                    <Link href={`/products/${product.slug}`}>View</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                    onClick={() => removeFavorite(fav.variant_id)}
                    aria-label="Remove from favorites"
                    title="Remove favorite"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
