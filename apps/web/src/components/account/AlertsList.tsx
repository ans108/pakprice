'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/axios';
import { Loader2, Trash2, BellOff, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AlertsList() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v1/price-alerts');
      setAlerts(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const removeAlert = async (alertId: string) => {
    try {
      await apiClient.delete(`/api/v1/price-alerts/${alertId}`);
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAlertActive = async (alert: any) => {
    try {
      const res = await apiClient.patch(`/api/v1/price-alerts/${alert.id}`, { isActive: !alert.is_active });
      setAlerts(alerts.map(a => a.id === alert.id ? res.data.data : a));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (alerts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <BellOff className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">No price alerts yet</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Set up price alerts on products to get notified when prices drop.
        </p>
        <Button asChild>
          <Link href="/search">Browse Products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-xl font-bold text-foreground mb-6">Price Alerts</h2>

      <div className="divide-y divide-border">
        {alerts.map((alert) => {
          const product = alert.variant?.product;
          if (!product) return null;

          // Find current lowest listed price for that exact variant
          const prices = alert.variant?.prices || [];
          const currentLowest = prices.reduce((min: number | null, p: any) => 
            p.price != null && p.in_stock ? (min === null || p.price < min ? p.price : min) : min, null);

          const isTriggered = !alert.is_active && alert.triggered_at != null;

          return (
            <div key={alert.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 bg-muted/30 rounded-xl border border-border shrink-0 flex items-center justify-center overflow-hidden p-1">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="object-contain w-full h-full" />
                  ) : (
                    <div className="w-full h-full bg-muted/50" />
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={`/products/${product.slug}`} className="font-semibold text-sm hover:text-primary transition-colors line-clamp-1">
                    {product.name}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Variant: <span className="font-medium text-foreground">{alert.variant?.name || 'Standard'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>
                      Target: <strong className="text-foreground">Rs. {alert.target_price.toLocaleString()}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Current: <strong className="text-foreground">{currentLowest ? `Rs. ${currentLowest.toLocaleString()}` : 'Unavailable'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                {isTriggered ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                    Triggered
                  </span>
                ) : alert.is_active ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Active
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                    Paused
                  </span>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => toggleAlertActive(alert)}
                >
                  {isTriggered ? 'Re-activate' : alert.is_active ? 'Pause' : 'Resume'}
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                  onClick={() => removeAlert(alert.id)}
                  aria-label="Delete alert"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
