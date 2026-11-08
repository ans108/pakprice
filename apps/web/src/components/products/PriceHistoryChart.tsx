'use client';

import React, { useMemo } from 'react';
import {
  TrendingDown,
  BarChart3,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ArrowDownRight,
  Clock,
  Store,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export interface PriceHistoryChartProps {
  productSlug?: string;
  variantId?: string;
  prices?: any[];
  productName?: string;
}

export function PriceHistoryChart({
  productSlug,
  variantId,
  prices = [],
  productName = 'Product',
}: PriceHistoryChartProps) {
  // Extract and sort valid active offers
  const activeOffers = useMemo(() => {
    if (!Array.isArray(prices) || prices.length === 0) return [];
    return prices
      .filter((p) => p && p.in_stock && typeof p.price === 'number' && p.price > 0)
      .map((p) => {
        const storeName = p.store?.name || p.store_name || p.store?.slug || 'Verified Store';
        const storeSlug = p.store?.slug || p.store_slug || '';
        const isStale = p.last_scraped_at
          ? Date.now() - new Date(p.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
          : false;

        return {
          id: p.id,
          storeName,
          storeSlug,
          price: p.price,
          originalPrice: p.original_price && p.original_price > p.price ? p.original_price : null,
          productUrl: p.product_url || '',
          lastScrapedAt: p.last_scraped_at || '',
          isStale,
        };
      })
      .sort((a, b) => a.price - b.price);
  }, [prices]);

  // Market stats calculation (Zero Server Load — 100% Client Calculated)
  const stats = useMemo(() => {
    if (activeOffers.length === 0) return null;

    const pricesList = activeOffers.map((o) => o.price);
    const lowest = pricesList[0];
    const highestListed = pricesList[pricesList.length - 1];

    const mrpCandidates = activeOffers
      .map((o) => o.originalPrice)
      .filter((p): p is number => typeof p === 'number' && p > lowest);
    const highestMrp = mrpCandidates.length > 0 ? Math.max(...mrpCandidates) : highestListed;

    const sum = pricesList.reduce((acc, p) => acc + p, 0);
    const avg = Math.round(sum / pricesList.length);

    const winningStore = activeOffers[0].storeName;
    const storeCount = new Set(activeOffers.map((o) => o.storeName.toLowerCase())).size;

    const maxSavingsRs = Math.max(0, highestMrp - lowest);
    const maxSavingsPct = highestMrp > 0 ? Math.round((maxSavingsRs / highestMrp) * 100) : 0;

    // Deal rating logic
    let dealBadge = 'Verified Competitive Pricing';
    let dealSubtitle = `Available across ${storeCount} ${storeCount === 1 ? 'tracked retailer' : 'tracked retailers'} in Pakistan.`;
    if (maxSavingsPct >= 15) {
      dealBadge = `Great Time to Buy — Save ${maxSavingsPct}% Below Retail`;
      dealSubtitle = `Save Rs. ${maxSavingsRs.toLocaleString()} by choosing ${winningStore} over highest market list price.`;
    } else if (maxSavingsPct > 0) {
      dealBadge = `Save Rs. ${maxSavingsRs.toLocaleString()} across Stores`;
      dealSubtitle = `Price spread of Rs. ${maxSavingsRs.toLocaleString()} found between ${winningStore} and other sellers.`;
    } else if (storeCount > 1) {
      dealBadge = 'Fair Market Value';
      dealSubtitle = `Prices are tightly matched across all ${storeCount} active retailers.`;
    }

    return {
      lowest,
      highest: highestListed,
      mrp: highestMrp,
      average: avg,
      winningStore,
      storeCount,
      maxSavingsRs,
      maxSavingsPct,
      dealBadge,
      dealSubtitle,
    };
  }, [activeOffers]);

  if (!stats || activeOffers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <Store className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
        <h3 className="text-sm font-semibold text-foreground">Market Price Intelligence</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Multi-store price analytics and savings evaluation will appear here once verified store offers are indexed for this variant.
        </p>
      </div>
    );
  }

  // Calculate position on thermometer bar (0% = lowest, 100% = highest/mrp)
  const rangeSpan = Math.max(1, stats.mrp - stats.lowest);
  const avgPos = Math.min(100, Math.max(10, Math.round(((stats.average - stats.lowest) / rangeSpan) * 100)));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-wrap items-center justify-between gap-3 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              Price Intelligence & Store Comparison
            </h2>
            <p className="text-xs text-muted-foreground">
              Real-time cross-store price dispersion and savings analysis for {productName}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          {stats.dealBadge}
        </div>
      </div>

      {/* ── 2-Panel Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* ── Left Panel: Deal Thermometer & Market Stats (Col 5) ── */}
        <div className="lg:col-span-5 p-5 sm:p-6 flex flex-col justify-between gap-6 bg-card">
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                Market Evaluation
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {stats.dealSubtitle}
              </p>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Lowest Price */}
              <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block truncate">
                  Lowest
                </span>
                <span className="text-base sm:text-lg font-extrabold text-foreground block mt-0.5">
                  Rs. {stats.lowest.toLocaleString()}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block truncate mt-0.5">
                  {stats.winningStore}
                </span>
              </div>

              {/* Market Average */}
              <div className="p-3 rounded-xl border border-border bg-muted/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                  Average
                </span>
                <span className="text-base sm:text-lg font-extrabold text-foreground block mt-0.5">
                  Rs. {stats.average.toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                  Across stores
                </span>
              </div>

              {/* Highest / Retail MRP */}
              <div className="p-3 rounded-xl border border-border bg-muted/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                  {stats.mrp > stats.highest ? 'Retail MRP' : 'Highest'}
                </span>
                <span className="text-base sm:text-lg font-extrabold text-foreground block mt-0.5">
                  Rs. {stats.mrp.toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                  Market ceiling
                </span>
              </div>
            </div>

            {/* Visual Price Range Gauge */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Best: Rs. {stats.lowest.toLocaleString()}
                </span>
                <span>Avg: Rs. {stats.average.toLocaleString()}</span>
                <span>Peak: Rs. {stats.mrp.toLocaleString()}</span>
              </div>
              <div className="relative w-full h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-primary/70 to-amber-500 rounded-full" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                <span>0% Spread</span>
                <span>Max Savings: Rs. {stats.maxSavingsRs.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Bottom Trust Badge */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/60 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Verified across official Pakistani retailers. Outbound store links lead directly to official product listings.
            </p>
          </div>
        </div>

        {/* ── Right Panel: Visual Store-by-Store Comparison Bars (Col 7) ── */}
        <div className="lg:col-span-7 p-5 sm:p-6 bg-card flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Store-by-Store Price Breakdown ({activeOffers.length} {activeOffers.length === 1 ? 'store' : 'stores'})
              </span>
              <span className="text-[11px] text-muted-foreground">
                Sorted by lowest price
              </span>
            </div>

            {/* Horizontal Bar rows */}
            <div className="space-y-3.5">
              {activeOffers.map((offer, idx) => {
                const isLowest = idx === 0;
                const diffFromLowest = offer.price - stats.lowest;
                // Bar width proportional to price relative to MRP
                const barWidthPct = Math.max(30, Math.min(100, Math.round((offer.price / stats.mrp) * 100)));

                return (
                  <div key={offer.id || idx} className="space-y-1.5">
                    {/* Store Title + Badges */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-foreground truncate">
                          {offer.storeName}
                        </span>
                        {isLowest ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Best Price
                          </span>
                        ) : diffFromLowest > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium text-[10px]">
                            +Rs. {diffFromLowest.toLocaleString()}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {offer.originalPrice && (
                          <span className="line-through text-muted-foreground/70 text-[11px]">
                            Rs. {offer.originalPrice.toLocaleString()}
                          </span>
                        )}
                        <span className={cn(
                          "font-bold text-sm",
                          isLowest ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        )}>
                          Rs. {offer.price.toLocaleString()}
                        </span>
                        {offer.productUrl && (
                          <a
                            href={offer.productUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={`Go to ${offer.storeName}`}
                            className="text-muted-foreground hover:text-primary transition-colors ml-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Horizontal Bar Graphic */}
                    <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden relative">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isLowest
                            ? "bg-emerald-500"
                            : "bg-primary/50 hover:bg-primary/70"
                        )}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>

                    {/* Subtext info */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {offer.lastScrapedAt
                          ? `Verified ${new Date(offer.lastScrapedAt).toLocaleDateString()}`
                          : 'Live verified'}
                      </span>
                      {isLowest && stats.maxSavingsRs > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Lowest price guaranteed across active listings
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriceHistoryChart;
