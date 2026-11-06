'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, Filter, Loader2, Store, Calendar, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/axios';
import { cn } from '@/utils/cn';

interface BankOfferItem {
  id: string;
  store_id: string;
  bank_name: string;
  card_type: string | null;
  discount_percent: number | null;
  cashback_percent: number | null;
  min_purchase: number | null;
  max_discount: number | null;
  description: string | null;
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

export default function BankOffersPage() {
  const [offers, setOffers] = useState<BankOfferItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [selectedBank, setSelectedBank] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [offersRes, storesRes] = await Promise.all([
          apiClient.get('/api/v1/bank-offers', {
            params: {
              ...(selectedStoreId !== 'all' ? { storeId: selectedStoreId } : {}),
              ...(selectedBank !== 'all' ? { bankName: selectedBank } : {}),
            },
          }),
          apiClient.get('/api/v1/stores'),
        ]);

        if (mounted) {
          setOffers(offersRes.data?.data ?? []);
          setStores(storesRes.data?.data ?? []);
        }
      } catch (err) {
        console.error('Failed to load bank offers:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [selectedStoreId, selectedBank]);

  // Derive unique banks for filter
  const uniqueBanks = Array.from(new Set(offers.map((o) => o.bank_name).filter(Boolean)));

  const activeOffers = offers.filter((o) => {
    if (!o.is_active) return false;
    if (o.valid_until && new Date(o.valid_until) < new Date()) return false;
    return true;
  });

  return (
    <div className="container-section py-10">
      {/* Header */}
      <div className="mb-8 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
          <CreditCard className="w-3.5 h-3.5" />
          Card Discounts & Cashback
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          Bank & Card Offers
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          Save on your electronics and online purchases by paying with eligible debit and credit cards from major Pakistani banks.
        </p>
      </div>

      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
        {/* Store filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none flex-1">
          <button
            onClick={() => setSelectedStoreId('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all',
              selectedStoreId === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            All Stores
          </button>
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => setSelectedStoreId(store.id)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5',
                selectedStoreId === store.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {store.name}
            </button>
          ))}
        </div>

        {/* Bank selector */}
        {uniqueBanks.length > 0 && (
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All Banks</option>
            {uniqueBanks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activeOffers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center max-w-lg mx-auto">
          <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">No active bank offers available</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            There are currently no active bank card promotions for the selected filter. Check back soon for updated partner deals!
          </p>
          <Button asChild variant="outline">
            <Link href="/search">Browse Products</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeOffers.map((offer) => {
            const discountLabel = offer.discount_percent
              ? `${offer.discount_percent}% OFF`
              : offer.cashback_percent
              ? `${offer.cashback_percent}% Cashback`
              : 'Special Discount';

            const expiryDate = offer.valid_until
              ? new Date(offer.valid_until).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Ongoing promotion';

            return (
              <div
                key={offer.id}
                className="group relative flex flex-col justify-between p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
              >
                <div>
                  {/* Header: Bank & Store */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{offer.bank_name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {offer.card_type && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                              {offer.card_type}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            at {offer.store?.name || 'Partner Store'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="text-base font-extrabold text-primary shrink-0">
                      {discountLabel}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm font-semibold text-foreground mb-2 line-clamp-2">
                    {offer.description || `Get ${discountLabel} when paying with ${offer.bank_name} cards.`}
                  </p>

                  {/* Terms */}
                  <div className="space-y-1 my-3 text-xs text-muted-foreground">
                    {offer.min_purchase && (
                      <p>• Min. spend: Rs. {offer.min_purchase.toLocaleString()}</p>
                    )}
                    {offer.max_discount && (
                      <p>• Max. savings cap: Rs. {offer.max_discount.toLocaleString()}</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground/70" />
                      <span>Valid until: {expiryDate}</span>
                    </p>
                  </div>
                </div>

                {/* Footer action */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Bank Partner</span>
                  </div>

                  {offer.store?.base_url && (
                    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                      <a
                        href={offer.store.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        Visit {offer.store.name}
                        <ExternalLink className="w-3 h-3" />
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
