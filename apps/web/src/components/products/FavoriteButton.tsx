'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/contexts/FavoritesContext';
import { cn } from '@/utils/cn';

interface FavoriteButtonProps {
  variantId?: string | null;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
}

export function FavoriteButton({ variantId, className, size = 'icon' }: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite } = useFavorites();
  const [submitting, setSubmitting] = useState(false);

  const favorited = isFavorited(variantId);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!variantId || submitting) return;

    try {
      setSubmitting(true);
      await toggleFavorite(variantId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        'rounded-full bg-background/80 backdrop-blur-sm shadow-sm hover:bg-background transition-transform active:scale-95',
        className
      )}
      onClick={handleToggle}
      disabled={!variantId || submitting}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      title={!variantId ? 'No variant available to favorite' : favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={cn(
          'w-4 h-4 transition-colors',
          favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-foreground'
        )}
      />
    </Button>
  );
}
