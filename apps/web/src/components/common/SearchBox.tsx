'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, Loader2, ArrowRight, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { productService } from '@/services/productService';
import type { SearchSuggestion } from '@/types';
import { cn } from '@/utils/cn';

interface SearchBoxProps {
  className?: string;
  placeholder?: string;
  size?: 'default' | 'lg';
  /** Pre-fill the search box (e.g. when navigating back from /search) */
  initialQuery?: string;
}

const popularSearches = [
  'iPhone 17',
  'Samsung Watch',
  'MacBook Air',
  'PlayStation 5',
  'Power Bank',
  'Dell',
];

/**
 * Increment 6M SearchBox — real-time autocomplete suggestions & search navigation.
 * Properly anchored below input, internal vertical scrolling, keyboard navigation,
 * request race condition protection, and responsive mobile layout.
 */
export default function SearchBox({
  className,
  placeholder = 'Search for a product, brand, or model...',
  size = 'default',
  initialQuery = '',
}: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef<number>(0);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions when query changes (debounced by ~300ms, latest query wins)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const currentReqId = ++requestIdRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await productService.getSuggestions(trimmed);
        if (currentReqId === requestIdRef.current) {
          setSuggestions(results);
          setIsOpen(true);
          setSelectedIndex(-1);
        }
      } catch (err) {
        if (currentReqId === requestIdRef.current) {
          setSuggestions([]);
        }
      } finally {
        if (currentReqId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  const navigateToSearch = (term: string) => {
    const q = term.trim();
    if (!q) return;
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const navigateToProduct = (slug: string) => {
    setIsOpen(false);
    router.push(`/products/${slug}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      navigateToProduct(suggestions[selectedIndex].slug);
    } else {
      navigateToSearch(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handlePopularClick = (term: string) => {
    setQuery(term);
    navigateToSearch(term);
  };

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      {/* Anchor container: Dropdown is anchored directly beneath the search input bar */}
      <div className="relative w-full">
        <form onSubmit={handleSearch} role="search" aria-label="Product search">
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-lg',
              'focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/60',
              'transition-all duration-200',
              size === 'lg' && 'p-2.5 rounded-2xl'
            )}
          >
            {isLoading ? (
              <Loader2
                className={cn(
                  'ml-2 text-primary animate-spin flex-shrink-0',
                  size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
                )}
                aria-hidden="true"
              />
            ) : (
              <Search
                className={cn(
                  'ml-2 text-muted-foreground flex-shrink-0',
                  size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
                )}
                aria-hidden="true"
              />
            )}

            <Input
              ref={inputRef}
              id="product-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0 || query.trim().length >= 2) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                'border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent flex-1',
                size === 'lg' && 'text-base h-11'
              )}
              autoComplete="off"
              aria-label="Search for products"
              aria-expanded={isOpen}
              aria-autocomplete="list"
            />

            {/* Clear button */}
            {query.length > 0 && (
              <button
                type="button"
                id="search-clear-button"
                onClick={handleClear}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors flex-shrink-0"
                aria-label="Clear search input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <Button
              type="submit"
              id="search-submit-button"
              size={size === 'lg' ? 'lg' : 'default'}
              className="flex-shrink-0 shadow-sm"
            >
              Search
            </Button>
          </div>
        </form>

        {/* Autocomplete Dropdown */}
        {isOpen && (
          <div
            id="search-suggestions-dropdown"
            className={cn(
              'absolute left-0 right-0 top-full mt-2 z-50',
              'rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl',
              'animate-in fade-in-0 zoom-in-95 duration-150',
              'max-h-[380px] overflow-y-auto overscroll-contain'
            )}
            style={{ zIndex: 9999 }}
            role="listbox"
          >
            <div className="p-1.5 flex flex-col gap-1">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between border-b border-border/50">
                <span>Suggested Products</span>
                <span>Direct Link</span>
              </div>

              {suggestions.length === 0 ? (
                <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Searching catalog...' : 'No matching products found.'}
                </div>
              ) : (
                suggestions.map((item, idx) => (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={selectedIndex === idx}
                    onClick={() => navigateToProduct(item.slug)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left',
                      selectedIndex === idx
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/70 text-foreground'
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-10 h-10 rounded-md bg-muted/60 overflow-hidden flex-shrink-0 border border-border/40">
                      {item.thumbnail ? (
                        <Image
                          src={item.thumbnail}
                          alt={item.name}
                          fill
                          sizes="40px"
                          className="object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Tag className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium line-clamp-1">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.brand && (
                          <span className="font-semibold text-primary/80">
                            {item.brand.name}
                          </span>
                        )}
                        {item.brand && item.category && <span>·</span>}
                        {item.category && (
                          <span className="line-clamp-1">{item.category.name}</span>
                        )}
                      </div>
                    </div>

                    {/* Arrow CTA */}
                    <ArrowRight
                      className={cn(
                        'w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform',
                        selectedIndex === idx && 'text-primary translate-x-0.5'
                      )}
                    />
                  </div>
                ))
              )}

              {/* Bottom bar: view all results for query */}
              <div
                onClick={() => navigateToSearch(query)}
                className="mt-1 pt-2 pb-1 px-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                <span>View all search results for &ldquo;{query.trim()}&rdquo;</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Popular search tags */}
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground font-medium">Popular:</span>
        {popularSearches.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => handlePopularClick(term)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border border-border',
              'bg-background/80 text-muted-foreground',
              'hover:bg-primary/10 hover:text-primary hover:border-primary/30',
              'transition-colors duration-150 cursor-pointer'
            )}
            aria-label={`Search for ${term}`}
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
}
