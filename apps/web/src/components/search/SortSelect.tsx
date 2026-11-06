'use client';

import React from 'react';
import type { SearchSortOption } from '@/types';
import { cn } from '@/utils/cn';

interface SortSelectProps {
  value: SearchSortOption;
  onChange: (sort: SearchSortOption) => void;
  className?: string;
}

const SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance (Best Match)' },
  { value: 'price_asc', label: 'Lowest Price (From Rs.)' },
  { value: 'store_count_desc', label: 'Most Stores Available' },
  { value: 'newest', label: 'Recently Updated' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
];

/**
 * Increment 6H Sort dropdown.
 * Supports relevance, price, store count, recency, and alphabetical sorting.
 */
export default function SortSelect({ value, onChange, className }: SortSelectProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor="sort-select" className="text-sm text-muted-foreground whitespace-nowrap">
        Sort by:
      </label>
      <select
        id="sort-select"
        value={value}
        onChange={(e) => onChange(e.target.value as SearchSortOption)}
        className={cn(
          'text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60',
          'cursor-pointer transition-colors shadow-sm'
        )}
        aria-label="Sort products"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
