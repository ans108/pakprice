import React from 'react';
import {
  Store,
  CheckCircle2,
  Clock,
  XCircle,
  SearchX,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { StoreOfferCard } from './StoreOfferCard';
import { cn } from '@/utils/cn';
import {
  CONFIGURED_STORES,
  ConfiguredStoreDefinition,
} from '@pakprice/shared';

export type ConfiguredStoreMeta = ConfiguredStoreDefinition;
export const ALL_CONFIGURED_STORES = CONFIGURED_STORES;

interface StoreOfferMatrixProps {
  selectedVariant: any;
  categorySlug?: string;
  lowestPrice: number | null;
}

export function StoreOfferMatrix({
  selectedVariant,
  categorySlug = '',
  lowestPrice,
}: StoreOfferMatrixProps) {
  const prices: any[] = selectedVariant?.prices || [];
  const normCategory = (categorySlug || '').toLowerCase();
  const isLaptopCategory = normCategory.includes('laptop') || normCategory.includes('computer');
  const isSmartwatchCategory = normCategory.includes('watch');
  const isMobileCategory = normCategory.includes('mobile') || normCategory.includes('phone');

  // Match all 12 configured stores to price rows cleanly
  const storeStatuses = CONFIGURED_STORES.map((store) => {
    const priceRow = prices.find(
      (p) =>
        (p.store_id && p.store?.slug === store.slug) ||
        (p.store?.name && p.store.name.toLowerCase() === store.name.toLowerCase()) ||
        p.store_slug === store.slug ||
        (p.product_url && p.product_url.toLowerCase().includes(store.slug))
    );

    if (priceRow && typeof priceRow.price === 'number' && priceRow.price > 0) {
      const isStale = priceRow.last_scraped_at
        ? Date.now() - new Date(priceRow.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
        : false;

      if (priceRow.in_stock && !isStale) {
        return {
          store,
          status: 'verified' as const,
          statusLabel: 'Verified Offer',
          subtext: `Rs. ${priceRow.price.toLocaleString()}`,
          priceRow,
          isStale: false,
        };
      } else if (priceRow.in_stock && isStale) {
        return {
          store,
          status: 'stale' as const,
          statusLabel: 'Stale Offer',
          subtext: `Rs. ${priceRow.price.toLocaleString()}`,
          priceRow,
          isStale: true,
        };
      } else {
        return {
          store,
          status: 'out_of_stock' as const,
          statusLabel: 'Out of Stock',
          subtext: 'Currently unavailable',
          priceRow,
          isStale,
        };
      }
    }

    // Category specialization checks
    if (store.slug === 'paklap' && !isLaptopCategory) {
      return {
        store,
        status: 'specialist' as const,
        statusLabel: 'Laptops Specialist',
        subtext: 'Computing only',
        priceRow: null,
        isStale: false,
      };
    }

    if (store.specialization === 'hypermarket' && (isLaptopCategory || isSmartwatchCategory)) {
      return {
        store,
        status: 'specialist' as const,
        statusLabel: 'Hypermarket',
        subtext: 'Groceries & Home',
        priceRow: null,
        isStale: false,
      };
    }

    // Default neutral status: no listing found for this specific model
    return {
      store,
      status: 'no_offer' as const,
      statusLabel: 'No offer for this model',
      subtext: 'Not currently listed',
      priceRow: null,
      isStale: false,
    };
  });

  // Active offers for top price comparison cards
  const activeOffers = storeStatuses
    .filter((s) => s.priceRow !== null)
    .sort((a, b) => {
      const order = { verified: 0, stale: 1, out_of_stock: 2, no_offer: 3, specialist: 4 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return (a.priceRow?.price || 0) - (b.priceRow?.price || 0);
    });

  const verifiedCount = storeStatuses.filter((s) => s.status === 'verified').length;
  const totalOffersCount = activeOffers.length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Active Offers Section ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Available Offers</h2>
            <span className="text-xs text-muted-foreground font-normal">
              ({totalOffersCount} {totalOffersCount === 1 ? 'store offer' : 'store offers'})
            </span>
          </div>

          {verifiedCount >= 2 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              Multi-store verified · {verifiedCount} stores
            </span>
          )}
        </div>

        {activeOffers.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activeOffers.map(({ store, status, priceRow }) => {
              const isLowest =
                status === 'verified' &&
                lowestPrice !== null &&
                priceRow.price === lowestPrice;

              return (
                <StoreOfferCard
                  key={priceRow.id || store.slug}
                  storeName={priceRow.store?.name || store.name}
                  storeLogo={priceRow.store?.logo_url || store.logo_url}
                  price={priceRow.price}
                  originalPrice={priceRow.original_price}
                  discountPercent={priceRow.discount_percent}
                  shippingFee={priceRow.shipping_fee ?? 0}
                  couponDiscount={priceRow.coupon_discount ?? 0}
                  bankDiscount={priceRow.bank_discount ?? 0}
                  finalPrice={priceRow.final_price ?? priceRow.price}
                  inStock={priceRow.in_stock}
                  productUrl={priceRow.product_url || ''}
                  lastScrapedAt={priceRow.last_scraped_at || ''}
                  isLowest={isLowest}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
            <p className="font-semibold text-foreground text-sm">Currently unavailable</p>
            <p className="text-xs text-muted-foreground mt-1">
              We couldn&apos;t find any active offers for this configuration across verified stores.
            </p>
          </div>
        )}
      </div>

      {/* ── 12 Monitored Stores Coverage Bar ───────────────────── */}
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              12 Monitored Stores Coverage Status
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            {verifiedCount} of 12 stores verified
          </span>
        </div>

        {/* Clean 3-column / 2-column responsive status pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {storeStatuses.map(({ store, status, statusLabel, priceRow }) => {
            const hasLink = Boolean(priceRow?.product_url);
            const CardWrapper = hasLink ? 'a' : 'div';
            const wrapperProps = hasLink
              ? {
                  href: priceRow!.product_url,
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  title: `View on ${store.name}`,
                }
              : {};

            const isVerified = status === 'verified';
            const isStale = status === 'stale';

            return (
              <CardWrapper
                key={store.slug}
                {...(wrapperProps as any)}
                className={cn(
                  'flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs',
                  isVerified
                    ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60'
                    : isStale
                      ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
                      : 'border-border/60 bg-background/50 hover:bg-muted/30 text-muted-foreground',
                  hasLink && 'cursor-pointer group'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 uppercase',
                      isVerified
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : isStale
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {store.name.slice(0, 2)}
                  </div>
                  <span className={cn(
                    'font-medium truncate',
                    isVerified ? 'text-foreground font-semibold' : 'text-foreground/80'
                  )}>
                    {store.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {priceRow && priceRow.price > 0 ? (
                    <span className={cn(
                      'font-bold text-[11px]',
                      isVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                    )}>
                      Rs. {priceRow.price.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {statusLabel}
                    </span>
                  )}
                  {hasLink && (
                    <ExternalLink className="w-3 h-3 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                  )}
                </div>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StoreOfferMatrix;
