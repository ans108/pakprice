'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import apiClient from '@/lib/axios';
import type { FavoriteWithProduct } from '@pakprice/shared';

interface FavoritesContextType {
  favorites: FavoriteWithProduct[];
  loading: boolean;
  isFavorited: (variantId?: string | null) => boolean;
  toggleFavorite: (variantId: string) => Promise<boolean>;
  removeFavorite: (variantId: string) => Promise<boolean>;
  refreshFavorites: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  loading: false,
  isFavorited: () => false,
  toggleFavorite: async () => false,
  removeFavorite: async () => false,
  refreshFavorites: async () => {},
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteWithProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchFavorites = useCallback(async () => {
    if (!userId) {
      setFavorites([]);
      return;
    }

    try {
      setLoading(true);
      const res = await apiClient.get('/api/v1/favorites');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setFavorites(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback(
    (variantId?: string | null): boolean => {
      if (!variantId) return false;
      return favorites.some((f) => f.variant_id === variantId);
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (variantId: string): Promise<boolean> => {
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return false;
      }

      if (!variantId) {
        console.warn('Cannot favorite: variantId is missing');
        return false;
      }

      const currentlyFavorited = favorites.some((f) => f.variant_id === variantId);
      const previousFavorites = [...favorites];

      // Optimistic update
      if (currentlyFavorited) {
        setFavorites((prev) => prev.filter((f) => f.variant_id !== variantId));
      } else {
        // Optimistically add placeholder favorite
        const optimisticFav: FavoriteWithProduct = {
          id: `opt-${Date.now()}`,
          user_id: user.id,
          variant_id: variantId,
          created_at: new Date().toISOString(),
          variant: null,
          product: null,
        };
        setFavorites((prev) => [optimisticFav, ...prev]);
      }

      try {
        if (currentlyFavorited) {
          await apiClient.delete(`/api/v1/favorites/${variantId}`);
          return false;
        } else {
          const res = await apiClient.post('/api/v1/favorites', { variantId });
          if (res.data?.success && res.data.data) {
            // Re-fetch to populate complete variant & price details
            fetchFavorites();
            return true;
          }
          return true;
        }
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
        // Rollback on failure
        setFavorites(previousFavorites);
        return currentlyFavorited;
      }
    },
    [user, favorites, router, fetchFavorites]
  );

  const removeFavorite = useCallback(
    async (variantId: string): Promise<boolean> => {
      if (!user || !variantId) return false;
      const previousFavorites = [...favorites];
      setFavorites((prev) => prev.filter((f) => f.variant_id !== variantId));

      try {
        await apiClient.delete(`/api/v1/favorites/${variantId}`);
        return true;
      } catch (err) {
        console.error('Failed to remove favorite:', err);
        setFavorites(previousFavorites);
        return false;
      }
    },
    [user, favorites]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        loading,
        isFavorited,
        toggleFavorite,
        removeFavorite,
        refreshFavorites: fetchFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
