'use client';

import React, { useState } from 'react';
import { Clock, Tag, Cpu, HardDrive, Palette, Hash, Barcode, Bell, Store } from 'lucide-react';
import type { ProductVariantWithPrices, ProductWithRelations, StoreOffer } from '@/types';
import ProductImage from '@/components/products/ProductImage';
import VariantSelector from '@/components/products/VariantSelector';
import { StoreOfferCard } from '@/components/products/StoreOfferCard';
import { StoreOfferMatrix } from '@/components/products/StoreOfferMatrix';
import { PriceHistoryChart } from '@/components/products/PriceHistoryChart';
import { FavoriteButton } from '@/components/products/FavoriteButton';
import { CompareButton } from '@/components/compare/CompareButton';
import { PriceAlertModal } from '@/components/products/PriceAlertModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface ProductDetailClientProps {
  product: ProductWithRelations;
  variants: ProductVariantWithPrices[];
}

/**
 * ProductDetailClient — handles interactive variant selection.
 * Variant image, specs, and model number update on selection.
 */
export default function ProductDetailClient({ product, variants }: ProductDetailClientProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? '');
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;

  // Best Price selection: strictly fresh eligible in-stock offers with valid product URLs.
  // Never promote stale, out-of-stock, ambiguous or fabricated offers to Best Price.
  const freshInStockPrices = selected?.prices?.filter((p: any) => {
    if (!p.in_stock || !p.price || p.price <= 0 || !p.product_url) return false;
    const isStale = p.last_scraped_at
      ? Date.now() - new Date(p.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
      : false;
    return !isStale;
  }) ?? [];

  const lowestPrice = freshInStockPrices.length > 0
    ? Math.min(...freshInStockPrices.map((p: any) => p.price))
    : null;

  // Stale in-stock prices for informational display only (never badged as Best Price)
  const staleInStockPrices = selected?.prices?.filter((p: any) => {
    if (!p.in_stock || !p.price || p.price <= 0 || !p.product_url) return false;
    const isStale = p.last_scraped_at
      ? Date.now() - new Date(p.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
      : false;
    return isStale;
  }) ?? [];

  const lowestStalePrice = staleInStockPrices.length > 0
    ? Math.min(...staleInStockPrices.map((p: any) => p.price))
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
      {/* ── Image column ──────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="relative w-full aspect-square rounded-2xl border border-border overflow-hidden bg-muted/40">
          <ProductImage
            product={product}
            variant={selected}
            fill
            priority
            className="rounded-2xl"
          />
        </div>
        {/* Variant thumbnails (future enhancement placeholder) */}
      </div>

      {/* ── Info column ───────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* Brand + Category */}
        <div className="flex flex-wrap items-center gap-2">
          {product.brand && (
            <span className="text-sm font-semibold text-primary uppercase tracking-wide">
              {product.brand.name}
            </span>
          )}
          {product.category && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted text-xs text-muted-foreground">
              <Tag className="w-3 h-3" aria-hidden="true" />
              {product.category.name}
            </span>
          )}
        </div>

        {/* Product name & Actions */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
            {product.name}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlertModalOpen(true)}
              className="gap-1.5 text-xs font-semibold h-9 rounded-xl border-border hover:border-primary/50"
              disabled={!selected}
              title="Set price drop alert"
            >
              <Bell className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Price Alert</span>
            </Button>
            <FavoriteButton variantId={selectedId} />
          </div>
        </div>

        {/* Top-level pricing & store count summary */}
        <div className="flex items-baseline justify-between gap-4 p-4 rounded-xl bg-muted/50 border border-border">
          <div>
            {lowestPrice ? (
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wide block">Best Price</span>
                <span className="text-3xl font-extrabold text-foreground">
                  Rs. {lowestPrice.toLocaleString()}
                </span>
              </div>
            ) : lowestStalePrice ? (
              <div>
                <span className="text-xs uppercase font-semibold text-amber-600 dark:text-amber-400 tracking-wide block">
                  Last Recorded Price (Stale &gt;72h)
                </span>
                <span className="text-3xl font-extrabold text-foreground">
                  Rs. {lowestStalePrice.toLocaleString()}
                </span>
              </div>
            ) : (
              <span className="text-base font-semibold text-muted-foreground">Out of stock</span>
            )}
          </div>
          {(() => {
            const verifiedOffers = selected?.prices?.filter((p: any) => {
              if (!p.in_stock || !p.price || p.price <= 0 || !p.product_url) return false;
              const isStale = p.last_scraped_at
                ? Date.now() - new Date(p.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
                : false;
              return !isStale;
            }) ?? [];
            const verifiedStoreCount = new Set(verifiedOffers.map((p: any) => p.store_id || p.store?.id || p.store?.slug)).size;

            const staleOffers = selected?.prices?.filter((p: any) => {
              if (!p.in_stock || !p.price || p.price <= 0) return false;
              const isStale = p.last_scraped_at
                ? Date.now() - new Date(p.last_scraped_at).getTime() > 72 * 60 * 60 * 1000
                : false;
              return isStale;
            }) ?? [];
            const staleStoreCount = new Set(staleOffers.map((p: any) => p.store_id || p.store?.id || p.store?.slug)).size;

            if (verifiedStoreCount > 0) {
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                  <Store className="w-3.5 h-3.5" />
                  {verifiedStoreCount} {verifiedStoreCount === 1 ? 'store found' : 'stores found'}
                  {staleStoreCount > 0 && ` (+${staleStoreCount} stale)`}
                </span>
              );
            }

            if (staleStoreCount > 0) {
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {staleStoreCount} {staleStoreCount === 1 ? 'stale offer' : 'stale offers'} (awaiting refresh)
                </span>
              );
            }

            return (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-medium">
                <Store className="w-3.5 h-3.5" />
                0 verified offers
              </span>
            );
          })()}
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        )}

        {/* ── Variant selector ──────────────────────────── */}
        {variants.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Select Configuration
            </h2>
            <VariantSelector
              variants={variants}
              selectedId={selectedId}
              onChange={setSelectedId}
            />
          </div>
        )}

        {/* ── Selected variant specs ────────────────────── */}
        {selected && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Specifications
            </h2>
            <dl className="space-y-2">
              {selected.ram_gb !== null && (
                <SpecRow icon={<Cpu className="w-3.5 h-3.5" />} label="RAM" value={`${selected.ram_gb}GB`} />
              )}
              {selected.storage_gb !== null && (
                <SpecRow
                  icon={<HardDrive className="w-3.5 h-3.5" />}
                  label="Storage"
                  value={selected.storage_gb >= 1024 ? `${selected.storage_gb / 1024}TB` : `${selected.storage_gb}GB`}
                />
              )}
              {selected.color && (
                <SpecRow icon={<Palette className="w-3.5 h-3.5" />} label="Color" value={selected.color} />
              )}
              {selected.model_number && (
                <SpecRow icon={<Hash className="w-3.5 h-3.5" />} label="Model" value={selected.model_number} />
              )}
              {selected.sku && (
                <SpecRow icon={<Barcode className="w-3.5 h-3.5" />} label="SKU" value={selected.sku} />
              )}
            </dl>
          </div>
        )}

        {/* ── 12-Store Offer Matrix ─────────────────────── */}
        {selected && (
          <StoreOfferMatrix
            selectedVariant={selected}
            categorySlug={(product.category as any)?.slug || ''}
            lowestPrice={lowestPrice}
          />
        )}

        {/* ── Price History ─────────────────────────────── */}
        {selected && (
          <div className="mt-4">
            <PriceHistoryChart productSlug={product.slug} variantId={selected.id} />
          </div>
        )}
      </div>

      {/* ── Price Alert Modal ─────────────────────────── */}
      <PriceAlertModal
        isOpen={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        variantId={selected?.id || ''}
        variantName={selected?.name || 'Standard'}
        productName={product.name}
        currentPrice={lowestPrice}
      />
    </div>
  );
}

// ── Spec row helper ───────────────────────────────────────────

interface SpecRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function SpecRow({ icon, label, value }: SpecRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <dt className="flex items-center gap-1.5 text-muted-foreground min-w-[80px]">
        <span className="text-muted-foreground/60" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-foreground font-medium">{value}</dd>
    </div>
  );
}
