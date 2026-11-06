'use client';

import React, { useState } from 'react';
import { Bell, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/lib/axios';
import Link from 'next/link';

interface PriceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  variantId: string;
  variantName: string;
  productName: string;
  currentPrice: number | null;
}

export function PriceAlertModal({
  isOpen,
  onClose,
  variantId,
  variantName,
  productName,
  currentPrice,
}: PriceAlertModalProps) {
  const { user } = useAuth();
  const [targetPrice, setTargetPrice] = useState<string>(
    currentPrice ? Math.round(currentPrice * 0.95).toString() : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsedPrice = Number(targetPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Please enter a valid target price greater than 0');
      return;
    }

    if (currentPrice && parsedPrice >= currentPrice) {
      setError(`Target price must be lower than current listed price (Rs. ${currentPrice.toLocaleString()})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await apiClient.post('/api/v1/price-alerts', {
        variantId,
        targetPrice: parsedPrice,
      });

      if (res.data?.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create price alert';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const applyPreset = (discountPct: number) => {
    if (!currentPrice) return;
    const discounted = Math.round(currentPrice * (1 - discountPct / 100));
    setTargetPrice(discounted.toString());
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md p-6 bg-card border border-border rounded-2xl shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Set Price Alert</h3>
            <p className="text-xs text-muted-foreground truncate max-w-[260px]">
              {productName} ({variantName})
            </p>
          </div>
        </div>

        {!user ? (
          <div className="py-6 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-foreground mb-1">Sign in required</h4>
            <p className="text-xs text-muted-foreground mb-6">
              You need a PakPrice account to receive instant notifications when prices drop.
            </p>
            <Button asChild className="w-full">
              <Link href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`}>
                Sign In to Set Alert
              </Link>
            </Button>
          </div>
        ) : success ? (
          <div className="py-8 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-foreground mb-1">Price Alert Created!</h4>
            <p className="text-xs text-muted-foreground">
              We will notify you the moment the listed price drops to Rs. {Number(targetPrice).toLocaleString()}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Lowest Listed Price:</span>
              <span className="font-bold text-foreground text-sm">
                {currentPrice ? `Rs. ${currentPrice.toLocaleString()}` : 'Unavailable'}
              </span>
            </div>

            <div>
              <label htmlFor="targetPrice" className="block text-xs font-semibold text-foreground mb-1.5">
                Notify me when price drops below (PKR):
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  Rs.
                </span>
                <input
                  id="targetPrice"
                  type="number"
                  required
                  min={1}
                  value={targetPrice}
                  onChange={(e) => {
                    setTargetPrice(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 250000"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            {currentPrice && currentPrice > 0 && (
              <div>
                <span className="block text-[11px] text-muted-foreground mb-1.5">Quick discount presets:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => applyPreset(pct)}
                      className="py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent transition-colors"
                    >
                      -{pct}% (Rs. {Math.round(currentPrice * (1 - pct / 100)).toLocaleString()})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Alerts evaluate strictly against the store's verified listed price and trigger once upon drop.
            </p>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="w-1/2" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="w-1/2" disabled={submitting || !targetPrice}>
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </span>
                ) : (
                  'Create Alert'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
