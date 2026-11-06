'use client';

import React from 'react';
import type { ProductVariant } from '@/types';
import { cn } from '@/utils/cn';

interface VariantSelectorProps {
  variants: ProductVariant[];
  selectedId: string | null;
  onChange: (variantId: string) => void;
}

/**
 * VariantSelector — interactive variant picker.
 *
 * Groups variants by RAM → Storage → Color.
 * Selecting a combination updates the selectedId.
 * Only shows groups that have data (e.g. if no RAM field, no RAM row).
 */
export default function VariantSelector({
  variants,
  selectedId,
  onChange,
}: VariantSelectorProps) {
  if (variants.length === 0) return null;

  // If only one variant, no selection UI needed
  if (variants.length === 1) {
    return (
      <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
        {variants[0].name}
      </div>
    );
  }

  // ── Derive unique values ──────────────────────────────────────────────
  const ramOptions = uniqueSorted(variants.map((v) => v.ram_gb).filter(notNull));
  const storageOptions = uniqueSorted(variants.map((v) => v.storage_gb).filter(notNull));
  const colorOptions = unique(variants.map((v) => v.color).filter(notNullStr));

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  const handleRamClick = (ram: number) => {
    // Find first variant with this RAM that's compatible with current selection
    const next =
      variants.find(
        (v) => v.ram_gb === ram && v.storage_gb === selected.storage_gb && v.color === selected.color
      ) ??
      variants.find((v) => v.ram_gb === ram && v.storage_gb === selected.storage_gb) ??
      variants.find((v) => v.ram_gb === ram);
    if (next) onChange(next.id);
  };

  const handleStorageClick = (storage: number) => {
    const next =
      variants.find(
        (v) => v.storage_gb === storage && v.ram_gb === selected.ram_gb && v.color === selected.color
      ) ??
      variants.find((v) => v.storage_gb === storage && v.ram_gb === selected.ram_gb) ??
      variants.find((v) => v.storage_gb === storage);
    if (next) onChange(next.id);
  };

  const handleColorClick = (color: string) => {
    const next =
      variants.find(
        (v) => v.color === color && v.ram_gb === selected.ram_gb && v.storage_gb === selected.storage_gb
      ) ??
      variants.find((v) => v.color === color && v.ram_gb === selected.ram_gb) ??
      variants.find((v) => v.color === color);
    if (next) onChange(next.id);
  };

  return (
    <div className="space-y-4">
      {/* RAM options */}
      {ramOptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            RAM
          </p>
          <div className="flex flex-wrap gap-2">
            {ramOptions.map((ram) => {
              const isActive = selected.ram_gb === ram;
              const available = variants.some((v) => v.ram_gb === ram);
              return (
                <button
                  key={ram}
                  type="button"
                  disabled={!available}
                  onClick={() => handleRamClick(ram)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                    !available && 'opacity-40 cursor-not-allowed'
                  )}
                  aria-pressed={isActive}
                  aria-label={`Select ${ram}GB RAM`}
                >
                  {ram}GB
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Storage options */}
      {storageOptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Storage
          </p>
          <div className="flex flex-wrap gap-2">
            {storageOptions.map((storage) => {
              const isActive = selected.storage_gb === storage;
              const available = variants.some((v) => v.storage_gb === storage);
              const label = storage >= 1024 ? `${storage / 1024}TB` : `${storage}GB`;
              return (
                <button
                  key={storage}
                  type="button"
                  disabled={!available}
                  onClick={() => handleStorageClick(storage)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                    !available && 'opacity-40 cursor-not-allowed'
                  )}
                  aria-pressed={isActive}
                  aria-label={`Select ${label} storage`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Color options */}
      {colorOptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Color
            {selected.color && (
              <span className="ml-2 normal-case font-normal text-foreground">
                — {selected.color}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {colorOptions.map((color) => {
              const isActive = selected.color === color;
              const available = variants.some((v) => v.color === color);
              return (
                <button
                  key={color}
                  type="button"
                  disabled={!available}
                  onClick={() => handleColorClick(color)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm transition-all',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm font-medium'
                      : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                    !available && 'opacity-40 cursor-not-allowed'
                  )}
                  aria-pressed={isActive}
                  aria-label={`Select ${color} color`}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected variant summary */}
      <div className="p-3 rounded-lg border border-border/50 bg-muted/40 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Selected: </span>
        {selected.name}
        {selected.model_number && (
          <span className="ml-2 text-xs font-mono">({selected.model_number})</span>
        )}
        {selected.sku && (
          <span className="ml-2 text-xs text-muted-foreground/70">SKU: {selected.sku}</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function notNull<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}
function notNullStr(v: string | null | undefined): v is string {
  return v !== null && v !== undefined && v.trim() !== '';
}
function uniqueSorted(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b);
}
function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}
