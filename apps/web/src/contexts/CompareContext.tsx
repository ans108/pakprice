'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ProductWithRelations } from '@/types';

export type CompareItem = Pick<ProductWithRelations, 'id' | 'slug' | 'name' | 'image_url' | 'brand'>;

interface CompareContextValue {
  compareList: CompareItem[];
  toggleCompare: (product: CompareItem) => void;
  removeFromCompare: (slug: string) => void;
  clearCompare: () => void;
  isComparing: (slug: string) => boolean;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [compareList, setCompareList] = useState<CompareItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Load from local storage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('pakprice_compare');
      if (stored) {
        setCompareList(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load compare list', err);
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem('pakprice_compare', JSON.stringify(compareList));
      } catch (err) {
        console.error('Failed to save compare list', err);
      }
    }
  }, [compareList, mounted]);

  const toggleCompare = (product: CompareItem) => {
    setCompareList((prev) => {
      const exists = prev.some((p) => p.slug === product.slug);
      if (exists) {
        return prev.filter((p) => p.slug !== product.slug);
      }
      if (prev.length >= 4) {
        alert('You can compare up to 4 products.');
        return prev;
      }
      return [...prev, product];
    });
  };

  const removeFromCompare = (slug: string) => {
    setCompareList((prev) => prev.filter((p) => p.slug !== slug));
  };

  const clearCompare = () => {
    setCompareList([]);
  };

  const isComparing = (slug: string) => compareList.some((p) => p.slug === slug);

  return (
    <CompareContext.Provider
      value={{
        compareList,
        toggleCompare,
        removeFromCompare,
        clearCompare,
        isComparing,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (context === undefined) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}
