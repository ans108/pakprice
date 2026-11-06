'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Scale } from 'lucide-react';
import { useCompare } from '@/contexts/CompareContext';
import { Button } from '@/components/ui/button';

export function CompareBar() {
  const { compareList, removeFromCompare, clearCompare } = useCompare();

  if (compareList.length === 0) return null;

  const compareUrl = `/compare?products=${compareList.map((p) => p.slug).join(',')}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-2xl p-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-border">
            <Scale className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Compare</span>
            <span className="text-xs text-muted-foreground">({compareList.length}/4)</span>
          </div>
          
          <div className="flex gap-2 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide flex-1 sm:flex-initial">
            {compareList.map((product) => (
              <div
                key={product.slug}
                className="relative group flex items-center gap-2 bg-card border border-border rounded-lg p-2 min-w-[140px] sm:w-48 shrink-0 shadow-sm"
              >
                <button
                  onClick={() => removeFromCompare(product.slug)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm"
                  aria-label={`Remove ${product.name} from comparison`}
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="w-8 h-8 relative rounded bg-muted overflow-hidden shrink-0">
                  <Image
                    src={product.image_url || '/placeholder.png'}
                    alt={product.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{product.name}</p>
                </div>
              </div>
            ))}
            
            {/* Empty slots placeholders */}
            {Array.from({ length: Math.max(0, 4 - compareList.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="hidden md:flex items-center justify-center border border-dashed border-border rounded-lg bg-muted/30 w-48 shrink-0 h-12"
              >
                <span className="text-xs text-muted-foreground font-medium">Add product</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCompare}
            className="text-muted-foreground hover:text-foreground text-xs h-9 w-full sm:w-auto"
          >
            Clear All
          </Button>
          <Button
            asChild
            className="w-full sm:w-auto h-9"
            disabled={compareList.length < 1}
          >
            <Link href={compareUrl} className="w-full sm:w-auto">
              Compare Now ({compareList.length})
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
