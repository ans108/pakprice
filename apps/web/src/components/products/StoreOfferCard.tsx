import React from 'react';
import { ExternalLink, Clock, Tag, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface StoreOfferCardProps {
  storeName: string;
  storeLogo?: string | null;
  price: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  shippingFee?: number;
  couponDiscount?: number;
  bankDiscount?: number;
  finalPrice?: number;
  inStock: boolean;
  productUrl: string;
  lastScrapedAt: string;
  /** When true, renders a green highlight border and "Best Deal" chip — marks the cheapest in-stock offer. */
  isLowest?: boolean;
}

export function StoreOfferCard({
  storeName,
  storeLogo,
  price,
  originalPrice,
  discountPercent,
  shippingFee = 0,
  couponDiscount = 0,
  bankDiscount = 0,
  finalPrice,
  inStock,
  productUrl,
  lastScrapedAt,
  isLowest = false,
}: StoreOfferCardProps) {
  const isStale = lastScrapedAt
    ? Date.now() - new Date(lastScrapedAt).getTime() > 72 * 60 * 60 * 1000
    : true;

  const timeAgo = lastScrapedAt
    ? new Date(lastScrapedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unknown';

  // Stale offers must never be badged as lowest price
  const showLowestBadge = isLowest && inStock && !isStale;

  return (
    <div className={cn(
      "flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-all",
      showLowestBadge
        ? "border-green-500/60 dark:border-green-400/50 ring-1 ring-green-500/20 dark:ring-green-400/15 hover:border-green-500/80"
        : "border-border hover:border-primary/30"
    )}>
      <div className="flex items-center gap-4 w-full sm:w-auto">
        <div className="w-12 h-12 bg-white rounded-lg border border-border flex items-center justify-center p-1 shrink-0">
          {storeLogo ? (
            <img src={storeLogo} alt={storeName} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground uppercase">{storeName.slice(0, 2)}</span>
          )}
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{storeName}</span>
            {showLowestBadge && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase tracking-wide">
                <Trophy className="w-2.5 h-2.5" />
                Lowest Price
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className={cn(
              "flex items-center gap-1 font-medium",
              inStock && !isStale ? "text-green-600" : isStale ? "text-amber-600 dark:text-amber-400" : "text-red-500"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                inStock && !isStale ? "bg-green-600" : isStale ? "bg-amber-500" : "bg-red-500"
              )} />
              {inStock ? (isStale ? 'In Stock (Stale)' : 'In Stock') : 'Out of Stock'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between w-full sm:w-auto gap-6 sm:gap-8">
        <div className="flex flex-col items-start sm:items-end">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-lg font-bold",
              showLowestBadge ? "text-green-700 dark:text-green-400" : "text-foreground"
            )}>
              Rs. {price.toLocaleString()}
            </span>
            {discountPercent && discountPercent > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 uppercase">
                <Tag className="w-2.5 h-2.5" />
                {discountPercent}% OFF
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {originalPrice && originalPrice > price && (
              <span className="line-through">
                Rs. {originalPrice.toLocaleString()}
              </span>
            )}
            <span>•</span>
            <span className={shippingFee === 0 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
              {shippingFee === 0 ? 'Free Shipping' : `+ Rs. ${shippingFee} Shipping`}
            </span>
          </div>
          {finalPrice && finalPrice < price && (
            <span className="text-[11px] text-primary font-medium mt-0.5">
              Est. Final: Rs. {finalPrice.toLocaleString()}
            </span>
          )}
        </div>

        <Button asChild size="sm" className={cn("shrink-0", showLowestBadge && "bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600")} disabled={!inStock}>
          <a href={productUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
            View at {storeName}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
