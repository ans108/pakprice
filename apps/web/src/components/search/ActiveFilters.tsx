'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ActiveFilter {
  label: string;
  onRemove: () => void;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  className?: string;
}

/**
 * ActiveFilters — row of dismissible filter chips.
 * Renders nothing if no filters are active.
 */
export default function ActiveFilters({ filters, className }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div
      className={cn('flex flex-wrap gap-2 items-center', className)}
      role="group"
      aria-label="Active filters"
    >
      <span className="text-xs text-muted-foreground font-medium">Active:</span>
      {filters.map((filter) => (
        <button
          key={filter.label}
          type="button"
          onClick={filter.onRemove}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-primary/10 text-primary border border-primary/20',
            'hover:bg-primary/20 transition-colors'
          )}
          aria-label={`Remove ${filter.label} filter`}
        >
          {filter.label}
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
