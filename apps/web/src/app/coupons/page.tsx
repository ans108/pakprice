'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tag, Copy, Check, ExternalLink, Filter, Loader2, Store, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/axios';
import { cn } from '@/utils/cn';

interface CouponItem {
  id: string;
  store_id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order: number | null;
  max_discount: number | null;
  url: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  store?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    base_url: string;
  };
}

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [couponsRes, storesRes] = await Promise.all([
          apiClient.get('/api/v1/coupons', {
            params: selectedStoreId !== 'all' ? { storeId: selectedStoreId } : {},
          }),
          apiClient.get('/api/v1/stores'),
        ]);

        if (mounted) {
          setCoupons(couponsRes.data?.data ?? []);
          setStores(storesRes.data?.data ?? []);
        }
      } catch (err) {
        console.error('Failed to load coupons:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [selectedStoreId]);

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeCoupons = coupons.filter((c) => {
    if (!c.is_active) return false;
    if (c.valid_until && new Date(c.valid_until) < new Date()) return false;
    return true;
  });

  return (
    <div className="container-section py-10">
      {/* Header */}
      <div className="mb-8 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
          <Tag className="w-3.5 h-3.5" />
          Verified Store Vouchers
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          Coupons & Promo Codes
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Discover verified store-specific coupons and promo codes to save extra on your orders across Pakistan's top retailers.
        </p>
      </div>

      {/* Store Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 scrollbar-none">
        <button
          onClick={() => setSelectedStoreId('all')}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all',
            selectedStoreId === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          All Stores ({coupons.length})
        </button>
        {stores.map((store) => (
          <button
            key={store.id}
            onClick={() => setSelectedStoreId(store.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-2',
              selectedStoreId === store.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {store.logo_url && (
              <img src={store.logo_url} alt="" className="w-3.5 h-3.5 object-contain rounded" />
            )}
            {store.name}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activeCoupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center max-w-lg mx-auto">
          <Tag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">No active coupons available</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            There are currently no active promotional coupons for this store. Check back soon for fresh codes!
          </p>
          <Button asChild variant="outline">
            <Link href="/search">Browse Best Prices</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeCoupons.map((coupon) => {
            const isCopied = copiedCode === coupon.code;
            const discountLabel =
              coupon.discount_type === 'percent'
                ? `${coupon.discount_value}% OFF`
                : `Rs. ${coupon.discount_value.toLocaleString()} OFF`;

            const expiryDate = coupon.valid_until
              ? new Date(coupon.valid_until).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Ongoing promotion';

            return (
              <div
                key={coupon.id}
                className="group relative flex flex-col justify-between p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
              >
                <div>
                  {/* Store & Discount header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center p-1 shrink-0 overflow-hidden">
                        {coupon.store?.logo_url ? (
                          <img
                            src={coupon.store.logo_url}
                            alt={coupon.store.name}
                            className="object-contain max-w-full max-h-full"
                          />
                        ) : (
                          <Store className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">
                          {coupon.store?.name || 'Partner Store'}
                        </h4>
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 mt-0.5">
                          Verified Active
                        </span>
                      </div>
                    </div>

                    <span className="text-base font-extrabold text-primary">
                      {discountLabel}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
                    {coupon.description || `Save ${discountLabel} on your purchase.`}
                  </p>

                  {/* Terms */}
                  <div className="space-y-1 my-3 text-xs text-muted-foreground">
                    {coupon.min_order && (
                      <p>• Min. order: Rs. {coupon.min_order.toLocaleString()}</p>
                    )}
                    {coupon.max_discount && (
                      <p>• Max discount: Rs. {coupon.max_discount.toLocaleString()}</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground/70" />
                      <span>Expires: {expiryDate}</span>
                    </p>
                  </div>
                </div>

                {/* Voucher code & action */}
                <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(coupon.code)}
                    className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-dashed border-primary/40 text-xs font-mono font-bold tracking-wider transition-colors"
                    title="Click to copy code"
                  >
                    <span className="truncate">{coupon.code}</span>
                    {isCopied ? (
                      <span className="flex items-center gap-1 text-[11px] font-sans text-green-600 font-semibold shrink-0">
                        <Check className="w-3.5 h-3.5" /> Copied
                      </span>
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                    )}
                  </button>

                  {coupon.store?.base_url && (
                    <Button asChild variant="outline" size="icon" className="shrink-0 h-9 w-9 rounded-xl">
                      <a
                        href={coupon.url || coupon.store.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Visit ${coupon.store.name}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
