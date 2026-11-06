'use client';

import React, { useState } from 'react';
import { X, SlidersHorizontal, ChevronDown, ChevronUp, Store, Check } from 'lucide-react';
import type { Category, Brand } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

interface FilterSidebarProps {
  categories: Category[];
  brands: Brand[];
  selectedCategory: string;
  selectedBrand: string;
  selectedStore?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  minStores?: number;
  onCategoryChange: (slug: string) => void;
  onBrandChange: (slug: string) => void;
  onStoreChange: (slug: string) => void;
  onPriceChange: (min?: number, max?: number) => void;
  onInStockChange: (inStock?: boolean) => void;
  onMinStoresChange: (minStores?: number) => void;
  onClearAll: () => void;
}

import { CONFIGURED_STORES } from '@pakprice/shared';

const STORES = [
  { slug: '', name: 'All Stores' },
  ...CONFIGURED_STORES.map((s) => ({ slug: s.slug, name: s.name })),
];

/**
 * Increment 6H FilterSidebar — desktop sidebar + mobile sheet.
 * Includes Category, Brand, Price Range, Store selector, and In-Stock / Multi-Store toggles.
 */
export default function FilterSidebar({
  categories,
  brands,
  selectedCategory,
  selectedBrand,
  selectedStore = '',
  minPrice,
  maxPrice,
  inStockOnly = false,
  minStores,
  onCategoryChange,
  onBrandChange,
  onStoreChange,
  onPriceChange,
  onInStockChange,
  onMinStoresChange,
  onClearAll,
}: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const [brandsExpanded, setBrandsExpanded] = useState(true);
  const [priceExpanded, setPriceExpanded] = useState(true);
  const [storesExpanded, setStoresExpanded] = useState(true);

  // Local state for price inputs
  const [localMin, setLocalMin] = useState(minPrice ? String(minPrice) : '');
  const [localMax, setLocalMax] = useState(maxPrice ? String(maxPrice) : '');

  const hasFilters = Boolean(
    selectedCategory ||
      selectedBrand ||
      selectedStore ||
      minPrice !== undefined ||
      maxPrice !== undefined ||
      inStockOnly ||
      minStores !== undefined
  );

  const activeFilterCount = [
    selectedCategory,
    selectedBrand,
    selectedStore,
    minPrice !== undefined || maxPrice !== undefined,
    inStockOnly,
    minStores !== undefined,
  ].filter(Boolean).length;

  const handleApplyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const min = localMin ? parseInt(localMin, 10) : undefined;
    const max = localMax ? parseInt(localMax, 10) : undefined;
    onPriceChange(
      !isNaN(min as number) ? min : undefined,
      !isNaN(max as number) ? max : undefined
    );
  };

  // Build root categories + children
  const rootCategories = categories.filter((c) => c.parent_id === null);
  const childCategories = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  const content = (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Discovery Filters</h2>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setLocalMin('');
              setLocalMax('');
              onClearAll();
            }}
            className="text-xs text-primary hover:underline font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Availability & Multi-Store Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground select-none">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onInStockChange(e.target.checked || undefined)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
          />
          <span>In Stock Only</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground select-none">
          <input
            type="checkbox"
            checked={minStores === 2}
            onChange={(e) => onMinStoresChange(e.target.checked ? 2 : undefined)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
          />
          <span className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>2+ Stores Found</span>
          </span>
        </label>
      </div>

      <div className="border-t border-border" />

      {/* Price Range Filter */}
      <div>
        <button
          type="button"
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
          onClick={() => setPriceExpanded((v) => !v)}
          aria-expanded={priceExpanded}
        >
          <span>Price Range (Rs.)</span>
          {priceExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {priceExpanded && (
          <form onSubmit={handleApplyPrice} className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="h-8 text-xs px-2"
                min="0"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <Input
                type="number"
                placeholder="Max"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="h-8 text-xs px-2"
                min="0"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="w-full h-7 text-xs">
              Apply Price
            </Button>
          </form>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Stores Filter */}
      <div>
        <button
          type="button"
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
          onClick={() => setStoresExpanded((v) => !v)}
          aria-expanded={storesExpanded}
        >
          <span>Store</span>
          {storesExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {storesExpanded && (
          <div className="space-y-0.5">
            {STORES.map((s) => (
              <FilterOption
                key={s.slug || 'all'}
                label={s.name}
                isActive={selectedStore === s.slug}
                onClick={() => onStoreChange(s.slug)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Categories */}
      <div>
        <button
          type="button"
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
          onClick={() => setCategoriesExpanded((v) => !v)}
          aria-expanded={categoriesExpanded}
        >
          <span>Category</span>
          {categoriesExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {categoriesExpanded && (
          <div className="space-y-0.5">
            <FilterOption
              label="All Categories"
              isActive={!selectedCategory}
              onClick={() => onCategoryChange('')}
            />
            {rootCategories.map((root) => {
              const children = childCategories(root.id);
              return (
                <React.Fragment key={root.id}>
                  <FilterOption
                    label={root.name}
                    isActive={selectedCategory === root.slug}
                    onClick={() => onCategoryChange(root.slug)}
                    isParent
                  />
                  {children.map((child) => (
                    <FilterOption
                      key={child.id}
                      label={child.name}
                      isActive={selectedCategory === child.slug}
                      onClick={() => onCategoryChange(child.slug)}
                      indent
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Brands */}
      <div>
        <button
          type="button"
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
          onClick={() => setBrandsExpanded((v) => !v)}
          aria-expanded={brandsExpanded}
        >
          <span>Brand</span>
          {brandsExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {brandsExpanded && (
          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
            <FilterOption
              label="All Brands"
              isActive={!selectedBrand}
              onClick={() => onBrandChange('')}
            />
            {brands.map((brand) => (
              <FilterOption
                key={brand.id}
                label={brand.name}
                isActive={selectedBrand === brand.slug}
                onClick={() => onBrandChange(brand.slug)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <div className="lg:hidden mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileOpen((v) => !v)}
          id="filter-toggle-button"
          aria-expanded={mobileOpen}
        >
          <SlidersHorizontal className="w-4 h-4 mr-2" aria-hidden="true" />
          Filters
          {hasFilters && (
            <span className="ml-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {/* Mobile drawer */}
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            {/* Sheet */}
            <div
              className="fixed inset-y-0 left-0 w-72 bg-background border-r border-border z-50 overflow-y-auto p-6 animate-slide-up"
              role="dialog"
              aria-label="Product discovery filters"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-foreground">Discovery Filters</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close filters"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
              {content}
            </div>
          </>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0" aria-label="Product discovery filters">
        <div className="sticky top-24 p-4 rounded-xl border border-border bg-card shadow-sm">
          {content}
        </div>
      </aside>
    </>
  );
}

// ── FilterOption ──────────────────────────────────────────────

interface FilterOptionProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  isParent?: boolean;
  indent?: boolean;
}

function FilterOption({ label, isActive, onClick, isParent, indent }: FilterOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
        indent ? 'pl-4 text-xs' : '',
        isParent ? 'font-medium' : 'font-normal',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
      aria-pressed={isActive}
    >
      <span className="line-clamp-1">{label}</span>
      {isActive && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 ml-1" />}
    </button>
  );
}
