import React from 'react';
import {
  Store,
  CheckCircle2,
  Clock,
  XCircle,
  SearchX,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { StoreOfferCard } from './StoreOfferCard';
import { cn } from '@/utils/cn';
import {
  CONFIGURED_STORES,
  ConfiguredStoreDefinition,
  StoreCoverageStatus,
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

  // Match authoritative configured stores (1..12) to price rows
  const storeStatuses = CONFIGURED_STORES.map((store) => {
    const priceRow = prices.find(
      (p) =>
        (p.store_id && p.store?.slug === store.slug) ||
        (p.store?.name && p.store.name.toLowerCase() === store.name.toLowerCase()) ||
        p.store_slug === store.slug
    );

    if (priceRow && typeof priceRow.price === 'number' && priceRow.price > 0) {
      const isStale = priceRow.last_scraped_at
        ? Date.now() - new Date(priceRow.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
        : false;

      if (priceRow.in_stock && !isStale) {
        return {
          store,
          status: 'verified' as StoreCoverageStatus,
          statusLabel: 'Verified Offer',
          subtext: 'Real-time verified offer',
          priceRow,
          isStale: false,
        };
      } else if (priceRow.in_stock && isStale) {
        return {
          store,
          status: 'stale' as StoreCoverageStatus,
          statusLabel: 'Stale Offer (>72h)',
          subtext: 'Recorded offer awaiting refresh',
          priceRow,
          isStale: true,
        };
      } else {
        return {
          store,
          status: 'out_of_stock' as StoreCoverageStatus,
          statusLabel: 'Out of Stock',
          subtext: 'Currently unavailable at store',
          priceRow,
          isStale,
        };
      }
    }

    // No listing exists in database for this store
    // Check category specialization
    if (store.slug === 'paklap') {
      if (!isLaptopCategory) {
        return {
          store,
          status: 'not_applicable' as StoreCoverageStatus,
          statusLabel: 'Not applicable',
          subtext: 'Store specializes in computing & laptops',
          priceRow: null,
          isStale: false,
        };
      } else {
        return {
          store,
          status: 'no_listing' as StoreCoverageStatus,
          statusLabel: 'No listing found',
          subtext: 'No verified offer found for this configuration',
          priceRow: null,
          isStale: false,
        };
      }
    }

    if (store.specialization === 'hypermarket') {
      if (isLaptopCategory || isSmartwatchCategory) {
        return {
          store,
          status: 'not_applicable' as StoreCoverageStatus,
          statusLabel: 'Not applicable',
          subtext: 'Category not carried by store catalog',
          priceRow: null,
          isStale: false,
        };
      }
      return {
        store,
        status: 'not_checked' as StoreCoverageStatus,
        statusLabel: 'Not checked',
        subtext: 'No automated lookup established yet',
        priceRow: null,
        isStale: false,
      };
    }

    if (store.slug === 'daraz') {
      return {
        store,
        status: 'unsupported' as StoreCoverageStatus,
        statusLabel: 'Unsupported / blocked',
        subtext: 'Automated verification restricted by anti-bot protection',
        priceRow: null,
        isStale: false,
      };
    }

    if (store.tier === 1) {
      // Tier 1 stores (PriceOye, Telemart, Mega.pk, Shophive) have active search connectors
      return {
        store,
        status: 'no_listing' as StoreCoverageStatus,
        statusLabel: 'No listing found',
        subtext: 'No verified offer identified for this configuration',
        priceRow: null,
        isStale: false,
      };
    }

    // Tier 2 other stores
    return {
      store,
      status: 'not_checked' as StoreCoverageStatus,
      statusLabel: 'Not checked',
      subtext: 'Store connector scheduled for future phase',
      priceRow: null,
      isStale: false,
    };
  });

  // Active offers for top price comparison cards
  const activeOffers = storeStatuses
    .filter((s) => s.priceRow !== null)
    .sort((a, b) => {
      // Verified first, then stale, then out-of-stock, then ascending price
      const order = { verified: 0, stale: 1, out_of_stock: 2, no_listing: 3, not_checked: 4, unsupported: 5, not_applicable: 6 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return (a.priceRow?.price || 0) - (b.priceRow?.price || 0);
    });

  const verifiedCount = storeStatuses.filter((s) => s.status === 'verified').length;
  const staleCount = storeStatuses.filter((s) => s.status === 'stale').length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Active Offers Section ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Available Offers</h2>
            <span className="text-xs text-muted-foreground font-normal">
              ({activeOffers.length} {activeOffers.length === 1 ? 'store offer' : 'store offers'})
            </span>
          </div>

          {verifiedCount >= 2 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold">
              <Store className="w-3 h-3" />
              Multi-store · {verifiedCount} verified stores
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
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
            <p className="font-semibold text-foreground text-sm">Currently unavailable</p>
            <p className="text-xs text-muted-foreground mt-1">
              We couldn&apos;t find any active offers for this configuration across verified stores.
            </p>
          </div>
        )}
      </div>

      {/* ── 12-Store Coverage Matrix (Displays exactly all 12 configured stores) ── */}
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
            {staleCount > 0 && ` (${staleCount} stale)`}
          </span>
        </div>

        {/* Full 12-store grid preserving deterministic ordering */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {storeStatuses.map(({ store, status, statusLabel, subtext, priceRow }) => {
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

            return (
              <CardWrapper
                key={store.slug}
                {...(wrapperProps as any)}
                className={cn(
                  'flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors',
                  hasLink && 'hover:border-primary/40 cursor-pointer group'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold border shrink-0 uppercase',
                      status === 'verified'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                        : status === 'stale'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                          : 'bg-muted border-border/40 text-muted-foreground'
                    )}
                  >
                    {store.name.slice(0, 2)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">{store.name}</span>
                      {hasLink && (
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {priceRow && priceRow.price > 0 ? (
                        <span className="font-semibold text-foreground">
                          Rs. {priceRow.price.toLocaleString()}
                          {status === 'stale' && ' (Stale)'}
                        </span>
                      ) : (
                        subtext
                      )}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium',
                      status === 'verified' &&
                        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 font-semibold',
                      status === 'stale' &&
                        'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40',
                      status === 'out_of_stock' &&
                        'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40',
                      status === 'no_listing' &&
                        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
                      status === 'not_checked' &&
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
                      status === 'unsupported' &&
                        'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40',
                      status === 'not_applicable' &&
                        'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50'
                    )}
                  >
                    {status === 'verified' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />}
                    {status === 'stale' && <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />}
                    {status === 'out_of_stock' && <XCircle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />}
                    {status === 'no_listing' && <SearchX className="w-2.5 h-2.5" />}
                    {status === 'not_checked' && <Clock className="w-2.5 h-2.5" />}
                    {status === 'unsupported' && <ShieldAlert className="w-2.5 h-2.5 text-orange-600 dark:text-orange-400" />}
                    {status === 'not_applicable' && <AlertTriangle className="w-2.5 h-2.5 text-zinc-400" />}
                    {statusLabel}
                  </span>
                </div>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </div>
  );
}
