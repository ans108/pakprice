import React from 'react';
import {
  Store,
  CheckCircle2,
  Clock,
  ExternalLink,
  Search,
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
  productName?: string;
  categorySlug?: string;
  lowestPrice: number | null;
}

/**
 * Generates direct search link for each of the 12 monitored stores
 */
export function getStoreSearchUrl(storeSlug: string, productName: string): string {
  const cleaned = (productName || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(Dual\s*Sim|Official\s*Warranty|Pin\s*Pack|PTA\s*Approved|Non\s*PTA|Global\s*Version|Box\s*Pack|1\s*Year\s*Warranty)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const q = encodeURIComponent(cleaned || productName);

  switch (storeSlug) {
    case 'daraz':
      return `https://www.daraz.pk/catalog/?q=${q}`;
    case 'priceoye':
      return `https://priceoye.pk/search?q=${q}`;
    case 'telemart':
      return `https://www.telemart.pk/search?q=${q}`;
    case 'mega-pk':
    case 'mega':
      return `https://www.mega.pk/search/?q=${q}`;
    case 'shophive':
      return `https://www.shophive.com/catalogsearch/result/?q=${q}`;
    case 'homeshopping':
      return `https://homeshopping.pk/search.php?search_query=${q}`;
    case 'paklap':
      return `https://www.paklap.pk/catalogsearch/result/?q=${q}`;
    case 'ishopping':
      return `https://www.ishopping.pk/catalogsearch/result/?q=${q}`;
    case 'naheed':
      return `https://www.naheed.pk/catalogsearch/result/?q=${q}`;
    case 'al-fatah':
    case 'alfatah':
      return `https://alfatah.com.pk/search?q=${q}`;
    case 'metro':
      return `https://www.metro-online.pk/search/${q}`;
    case 'carrefour':
      return `https://www.carrefour.pk/mafpak/en/search?keyword=${q}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(`${storeSlug} ${cleaned}`)}`;
  }
}

export function StoreOfferMatrix({
  selectedVariant,
  productName = '',
  categorySlug = '',
  lowestPrice,
}: StoreOfferMatrixProps) {
  const prices: any[] = selectedVariant?.prices || [];
  const normCategory = (categorySlug || '').toLowerCase();
  const isLaptopCategory = normCategory.includes('laptop') || normCategory.includes('computer');
  const isSmartwatchCategory = normCategory.includes('watch');

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
          searchUrl: priceRow.product_url || getStoreSearchUrl(store.slug, productName),
        };
      } else if (priceRow.in_stock && isStale) {
        return {
          store,
          status: 'stale' as const,
          statusLabel: 'Stale Offer',
          subtext: `Rs. ${priceRow.price.toLocaleString()}`,
          priceRow,
          isStale: true,
          searchUrl: priceRow.product_url || getStoreSearchUrl(store.slug, productName),
        };
      } else {
        return {
          store,
          status: 'out_of_stock' as const,
          statusLabel: 'Out of Stock',
          subtext: 'Currently unavailable',
          priceRow,
          isStale,
          searchUrl: priceRow.product_url || getStoreSearchUrl(store.slug, productName),
        };
      }
    }

    // Category specialization note
    if (store.slug === 'paklap' && !isLaptopCategory) {
      return {
        store,
        status: 'specialist' as const,
        statusLabel: 'Laptops Specialist',
        subtext: 'Search computing catalog',
        priceRow: null,
        isStale: false,
        searchUrl: getStoreSearchUrl(store.slug, productName),
      };
    }

    if (store.specialization === 'hypermarket' && (isLaptopCategory || isSmartwatchCategory)) {
      return {
        store,
        status: 'specialist' as const,
        statusLabel: 'Hypermarket',
        subtext: 'Search general catalog',
        priceRow: null,
        isStale: false,
        searchUrl: getStoreSearchUrl(store.slug, productName),
      };
    }

    // Default: live search link on this store
    return {
      store,
      status: 'live_link' as const,
      statusLabel: 'Check Live',
      subtext: 'Search live catalog',
      priceRow: null,
      isStale: false,
      searchUrl: getStoreSearchUrl(store.slug, productName),
    };
  });

  // Active offers for top price comparison cards
  const activeOffers = storeStatuses
    .filter((s) => s.priceRow !== null)
    .sort((a, b) => {
      const order = { verified: 0, stale: 1, out_of_stock: 2, live_link: 3, specialist: 4 };
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
          <span className="text-[11px] text-muted-foreground font-semibold">
            {verifiedCount} Direct Prices · All 12 Stores Linked
          </span>
        </div>

        {/* 2-Column Spacious Grid — Zero Name Truncation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {storeStatuses.map(({ store, status, statusLabel, subtext, priceRow, searchUrl }) => {
            const isVerified = status === 'verified';
            const isStale = status === 'stale';
            const hasDirectOffer = Boolean(priceRow && priceRow.price > 0);

            return (
              <a
                key={store.slug}
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={hasDirectOffer ? `View offer on ${store.name}` : `Check live search on ${store.name}`}
                className={cn(
                  'group flex items-center justify-between p-3 rounded-xl border transition-all text-xs cursor-pointer',
                  isVerified
                    ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10'
                    : isStale
                      ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10'
                      : 'border-border/60 bg-background/50 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground'
                )}
              >
                {/* Store Name & Logo Badge */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 uppercase tracking-tight',
                      isVerified
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : isStale
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors'
                    )}
                  >
                    {store.name.slice(0, 2)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={cn(
                      'font-semibold text-xs whitespace-nowrap',
                      isVerified ? 'text-foreground font-bold' : 'text-foreground/90 group-hover:text-primary transition-colors'
                    )}>
                      {store.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80 truncate">
                      {hasDirectOffer ? 'Direct in-stock offer' : subtext}
                    </span>
                  </div>
                </div>

                {/* Right Badge / Action */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasDirectOffer ? (
                    <div className="text-right">
                      <span className={cn(
                        'font-bold text-xs block leading-tight',
                        isVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                      )}>
                        Rs. {priceRow.price.toLocaleString()}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-medium flex items-center justify-end gap-0.5">
                        Verified Offer
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/60 group-hover:bg-primary/10 group-hover:text-primary text-[11px] font-medium text-foreground/75 border border-border/50 group-hover:border-primary/30 transition-all">
                      <Search className="w-2.5 h-2.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      Check Live on {store.name} ↗
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StoreOfferMatrix;
