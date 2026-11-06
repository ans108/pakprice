'use client';

import React from 'react';
import { Scale } from 'lucide-react';
import { useCompare, CompareItem } from '@/contexts/CompareContext';
import { cn } from '@/utils/cn';

interface CompareButtonProps {
  product: CompareItem;
  className?: string;
  variant?: 'icon' | 'labeled' | 'checkbox';
}

export function CompareButton({ product, className, variant = 'icon' }: CompareButtonProps) {
  const { toggleCompare, isComparing } = useCompare();
  const active = isComparing(product.slug);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCompare(product);
  };

  if (variant === 'checkbox') {
    return (
      <label 
        className={cn(
          "flex items-center gap-2 cursor-pointer text-sm select-none group",
          className
        )}
        onClick={handleClick}
      >
        <div className={cn(
          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
          active 
            ? "bg-primary border-primary text-primary-foreground" 
            : "border-input bg-background group-hover:border-primary/50"
        )}>
          {active && <Scale className="w-2.5 h-2.5" />}
        </div>
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          Compare
        </span>
      </label>
    );
  }

  if (variant === 'labeled') {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary hover:bg-primary/20'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
          className
        )}
        aria-label={active ? "Remove from compare" : "Add to compare"}
      >
        <Scale className="w-4 h-4" />
        <span>{active ? 'Comparing' : 'Compare'}</span>
      </button>
    );
  }

  // Icon only (default)
  return (
    <button
      onClick={handleClick}
      className={cn(
        'p-2 rounded-full transition-all duration-200 backdrop-blur-sm',
        active
          ? 'bg-primary text-primary-foreground shadow-md scale-110'
          : 'bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground hover:scale-110 shadow-sm border border-border/50',
        className
      )}
      aria-label={active ? "Remove from compare" : "Add to compare"}
      title={active ? "Remove from compare" : "Add to compare"}
    >
      <Scale className="w-4 h-4" />
    </button>
  );
}
