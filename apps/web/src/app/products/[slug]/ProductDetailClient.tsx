'use client';

import React, { useState } from 'react';
import {
  Clock,
  Tag,
  Cpu,
  HardDrive,
  Palette,
  Hash,
  Barcode,
  Bell,
  Store,
  Monitor,
  Battery,
  Zap,
  Wifi,
  Layers,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import type { ProductVariantWithPrices, ProductWithRelations } from '@/types';
import ProductImage from '@/components/products/ProductImage';
import VariantSelector from '@/components/products/VariantSelector';
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
 * ProductDetailClient — balanced 2-zone product detail layout.
 * Left Column (lg:col-span-5): Image gallery, Specifications card, Market Deal Summary.
 * Right Column (lg:col-span-7): Title, actions, Best Price banner, Variant selector, Store Offers.
 * Bottom Zone (Full width): Price Intelligence & Store-by-Store comparison analytics.
 */
export default function ProductDetailClient({ product, variants }: ProductDetailClientProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? '');
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;

  // Best Price selection: strictly fresh eligible in-stock offers with valid product URLs.
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

  // Stale in-stock prices for informational display only
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

  // Extract all distinct valid image URLs across product and variants
  const galleryImages = React.useMemo(() => {
    const urls = new Set<string>();
    const isValid = (u?: string | null) => {
      if (!u) return false;
      const t = u.trim();
      return t.startsWith('https://') && t.length > 12;
    };
    if (isValid(product.image_url)) urls.add(product.image_url!.trim());
    for (const v of variants) {
      if (isValid(v.image_url)) urls.add(v.image_url!.trim());
    }
    return Array.from(urls);
  }, [product.image_url, variants]);

  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  // When selected variant changes, reset active image if variant has its own image
  React.useEffect(() => {
    if (selected?.image_url) {
      setActiveImageUrl(selected.image_url);
    } else {
      setActiveImageUrl(null);
    }
  }, [selectedId, selected?.image_url]);

  const currentDisplayUrl = activeImageUrl || selected?.image_url || product.image_url;

  // Market Deal Savings computation for left column summary box
  const dealSavings = React.useMemo(() => {
    const active = (selected?.prices || []).filter((p: any) => p.in_stock && p.price > 0);
    const lowest = lowestPrice || lowestStalePrice || 0;
    if (active.length === 0 || lowest === 0) {
      return { highest: lowest, savingsRs: 0, pct: 0 };
    }
    const maxListed = Math.max(...active.map((p: any) => p.price));
    const mrpList = active
      .map((p: any) => p.original_price)
      .filter((p: any) => typeof p === 'number' && p > lowest);
    const highest = mrpList.length > 0 ? Math.max(...mrpList, maxListed) : maxListed;
    const savingsRs = Math.max(0, highest - lowest);
    const pct = highest > 0 ? Math.round((savingsRs / highest) * 100) : 0;
    return { highest, savingsRs, pct };
  }, [selected?.prices, lowestPrice, lowestStalePrice]);

  // Rich category-aware specifications
  const richSpecs = React.useMemo(() => {
    const text = `${product.name} ${product.description || ''} ${selected?.name || ''}`;
    const items: Array<{ icon: React.ReactNode; label: string; value: string }> = [];

    if (product.brand?.name) {
      items.push({ icon: <Tag className="w-3.5 h-3.5" />, label: 'Brand', value: product.brand.name });
    }
    if (product.category?.name) {
      items.push({ icon: <Tag className="w-3.5 h-3.5" />, label: 'Category', value: product.category.name });
    }
    if (selected?.model_number) {
      items.push({ icon: <Hash className="w-3.5 h-3.5" />, label: 'Model', value: selected.model_number });
    }
    if (selected?.sku) {
      items.push({ icon: <Barcode className="w-3.5 h-3.5" />, label: 'SKU', value: selected.sku });
    }

    // RAM / Memory
    if (selected?.ram_gb !== null && selected?.ram_gb !== undefined) {
      items.push({ icon: <Cpu className="w-3.5 h-3.5" />, label: 'RAM', value: `${selected.ram_gb} GB` });
    } else {
      const ramM = text.match(/\b(\d{1,2})\s*GB\s*(?:RAM|D5|DDR\d)?\b/i);
      if (ramM) {
        items.push({ icon: <Cpu className="w-3.5 h-3.5" />, label: 'RAM', value: `${ramM[1]} GB` });
      }
    }

    // Storage / SSD
    if (selected?.storage_gb !== null && selected?.storage_gb !== undefined) {
      const val = selected.storage_gb >= 1024 ? `${selected.storage_gb / 1024} TB` : `${selected.storage_gb} GB`;
      items.push({ icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage', value: val });
    } else {
      const ssdM = text.match(/\b(\d{1,4})\s*(GB|TB)\s*(?:SSD|Storage|ROM|eMMC|HDD)?\b/i);
      if (ssdM) {
        items.push({ icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage', value: `${ssdM[1]} ${ssdM[2].toUpperCase()}` });
      }
    }

    // Display / Size
    const mmM = text.match(/\b(\d{2})\s*mm\b/i);
    const inchM = text.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:["”]|inch(?:es)?)\s*(AMOLED|OLED|Super AMOLED|Retina|IPS|WQXGA|WUXGA|FHD|HD\+?|2\.5K|3K|Display)?\b/i);
    if (mmM) {
      items.push({ icon: <Monitor className="w-3.5 h-3.5" />, label: 'Case / Size', value: `${mmM[1]} mm` });
    } else if (inchM) {
      items.push({ icon: <Monitor className="w-3.5 h-3.5" />, label: 'Display', value: `${inchM[1]}" ${inchM[2] || ''}`.trim() });
    }

    // Battery Capacity
    const batM = text.match(/\b(\d{3,5})\s*mAh\b/i);
    if (batM) {
      items.push({ icon: <Battery className="w-3.5 h-3.5" />, label: 'Battery', value: `${batM[1]} mAh` });
    }

    // Power / Fast Charging
    const wattM = text.match(/\b(\d{2,3}(?:\.\d)?)\s*W\b/i);
    if (wattM) {
      items.push({ icon: <Zap className="w-3.5 h-3.5" />, label: 'Charging', value: `${wattM[1]}W Fast Charging` });
    }

    // Processor / Chip
    const procM = text.match(/\b(Apple\s+M\d\s+Chip|M\d\s+Chip|A\d+\s+Bionic|A\d+\s+Chip|Intel\s+Core\s+(?:i\d|Ultra\s+\d)[\w\s-]*|Ryzen\s+[3579][\w\s-]*|Snapdragon\s+[\w\s]+)\b/i);
    if (procM) {
      items.push({ icon: <Layers className="w-3.5 h-3.5" />, label: 'Processor', value: procM[1].trim() });
    }

    // Color
    if (selected?.color) {
      items.push({ icon: <Palette className="w-3.5 h-3.5" />, label: 'Color', value: selected.color });
    }

    // Connectivity
    const conn: string[] = [];
    if (/\b5G\b/i.test(text)) conn.push('5G');
    else if (/\b4G(?:\s*LTE)?\b/i.test(text)) conn.push('4G LTE');
    if (/\b(?:Bluetooth|BT)\s*(\d(?:\.\d)?)?\b/i.test(text)) {
      const btVer = text.match(/\b(?:Bluetooth|BT)\s*(\d(?:\.\d)?)\b/i);
      conn.push(btVer ? `Bluetooth ${btVer[1]}` : 'Bluetooth');
    }
    if (/\b(TWS|True\s*Wireless)\b/i.test(text)) conn.push('True Wireless (TWS)');
    if (/\b(ANC|Active\s*Noise\s*Cancellation)\b/i.test(text)) conn.push('ANC');
    if (/\bWi-?Fi\b/i.test(text)) conn.push('Wi-Fi');
    if (/\bGPS\b/i.test(text)) conn.push('GPS');
    if (conn.length > 0) {
      items.push({ icon: <Wifi className="w-3.5 h-3.5" />, label: 'Connectivity', value: Array.from(new Set(conn)).join(', ') });
    }

    return items;
  }, [product, selected]);

  return (
    <div className="flex flex-col gap-10">
      {/* ── Top Zone: Balanced 2-Column Grid (Zero Empty Space) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* ── Left Column (Col 5): Image + Specs + Deal Summary ── */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Main Product Image Card */}
          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-square rounded-2xl border border-border overflow-hidden bg-muted/30 shadow-xs">
              <ProductImage
                product={{ ...product, image_url: currentDisplayUrl }}
                variant={selected ? { ...selected, image_url: currentDisplayUrl } : null}
                fill
                priority
                className="rounded-2xl"
              />
            </div>

            {/* Interactive Thumbnail Gallery Strip */}
            {galleryImages.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 scrollbar-thin">
                {galleryImages.map((imgUrl, idx) => {
                  const isSelected = currentDisplayUrl === imgUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageUrl(imgUrl)}
                      className={cn(
                        'relative w-14 h-14 rounded-xl border bg-card overflow-hidden shrink-0 transition-all p-1 flex items-center justify-center cursor-pointer',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30 scale-105 shadow-xs'
                          : 'border-border hover:border-primary/50 opacity-70 hover:opacity-100'
                      )}
                      title={`View image ${idx + 1}`}
                      aria-label={`Thumbnail image ${idx + 1}`}
                    >
                      <img
                        src={imgUrl}
                        alt={`${product.name} thumbnail ${idx + 1}`}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Specifications Card (Balanced in Left Column) */}
          {selected && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Product Specifications
                </h2>
                {product.category && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {product.category.name}
                  </span>
                )}
              </div>
              {richSpecs.length > 0 ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                  {richSpecs.map((spec, i) => (
                    <SpecRow key={i} icon={spec.icon} label={spec.label} value={spec.value} />
                  ))}
                </dl>
              ) : (
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
              )}
            </div>
          )}

          {/* Quick Deal Summary Box */}
          {selected && (lowestPrice || lowestStalePrice) && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Market Deal Summary
                </span>
                {dealSavings.pct > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    Save {dealSavings.pct}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Best Verified</span>
                  <span className="font-extrabold text-foreground text-sm sm:text-base">
                    Rs. {(lowestPrice || lowestStalePrice)?.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Highest / Retail MRP</span>
                  <span className="font-extrabold text-foreground text-sm sm:text-base">
                    Rs. {dealSavings.highest.toLocaleString()}
                  </span>
                </div>
              </div>

              {dealSavings.savingsRs > 0 && (
                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Max Potential Savings:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    Rs. {dealSavings.savingsRs.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Column (Col 7): Title + Best Price + Offers ── */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Brand + Category */}
          <div className="flex flex-wrap items-center gap-2">
            {product.brand && (
              <span className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wide">
                {product.brand.name}
              </span>
            )}
            {product.category && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-border bg-muted text-xs text-muted-foreground">
                <Tag className="w-3 h-3" aria-hidden="true" />
                {product.category.name}
              </span>
            )}
          </div>

          {/* Product Name & Actions */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
              {product.name}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <CompareButton product={product} variant="labeled" className="h-9 rounded-xl border border-border" />
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

          {/* Best Price Highlight Banner */}
          <div className="flex items-baseline justify-between gap-4 p-4 rounded-2xl bg-muted/40 border border-border">
            <div>
              {lowestPrice ? (
                <div>
                  <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wide block">
                    Best Price
                  </span>
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
                    {staleStoreCount} {staleStoreCount === 1 ? 'stale offer' : 'stale offers'}
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

          {/* Variant Selector */}
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

          {/* Available Store Offers (Matrix) */}
          {selected && (
            <StoreOfferMatrix
              selectedVariant={selected}
              productName={product.name}
              categorySlug={(product.category as any)?.slug || ''}
              lowestPrice={lowestPrice}
            />
          )}
        </div>
      </div>

      {/* ── Bottom Full-Width Zone: Price Intelligence Component ── */}
      {selected && (
        <div className="w-full mt-4">
          <PriceHistoryChart
            prices={selected.prices}
            productName={product.name}
            productSlug={product.slug}
            variantId={selected.id}
          />
        </div>
      )}

      {/* Price Alert Modal */}
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
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <dt className="flex items-center gap-1.5 text-muted-foreground min-w-[70px]">
        <span className="text-muted-foreground/60" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-foreground font-medium truncate">{value}</dd>
    </div>
  );
}
