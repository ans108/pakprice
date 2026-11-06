'use client';

import React, { useState, useEffect } from 'react';
import apiClient from '@/lib/axios';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PriceHistoryChartProps {
  productSlug: string;
  variantId: string;
}

type Range = '7d' | '30d' | '90d' | '1y' | 'all';
const RANGES: { label: string; value: Range; title?: string }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '1Y', value: '1y' },
  { label: 'Max (1Y)', value: 'all', title: '1 Year Maximum Window' },
];

export function PriceHistoryChart({ productSlug, variantId }: PriceHistoryChartProps) {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);

    apiClient.get(`/api/v1/products/${productSlug}/price-history`, {
      params: { range, variantId }
    })
      .then(res => {
        if (mounted) {
          setData(res.data.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [productSlug, variantId, range]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Price History</h3>
        <div className="flex bg-muted/50 p-0.5 rounded-lg">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                range === r.value 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 h-64 flex flex-col justify-end relative">
        {loading && (
          <div className="absolute inset-0 z-10 bg-card/50 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {error ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Failed to load price history
          </div>
        ) : !data || data.points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No price history available for this period.
          </div>
        ) : (
          <div className="h-full w-full flex items-end justify-between gap-1 pt-4 pb-2 relative">
            {/* Very simple SVG/CSS based bar chart representation for Phase 4 */}
            {data.points.map((point: any, i: number) => {
              const maxPrice = data.highestPrice;
              const minPrice = Math.max(0, data.lowestPrice * 0.8); // Add some padding below
              const heightPercent = Math.max(10, ((point.price - minPrice) / (maxPrice - minPrice)) * 100);
              
              return (
                <div 
                  key={i} 
                  className="group relative flex-1 flex flex-col justify-end items-center h-full min-w-[2px]"
                >
                  <div 
                    className="w-full bg-primary/20 hover:bg-primary transition-colors rounded-t-sm"
                    style={{ height: `${heightPercent}%` }}
                  />
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20 transition-opacity">
                    Rs. {point.price.toLocaleString()}
                    <br/>
                    <span className="text-muted/70">{new Date(point.date).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
