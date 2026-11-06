import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Store } from '@/types';

interface StoreCardProps {
  store: Store;
  className?: string;
}

/** Generate consistent initials-based avatar for stores without a logo */
function StoreInitials({ name }: { name: string }) {
  const initials = name
    .split(/[\s.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

/**
 * Displays a single store card.
 * Image handling: if logo_url is null or fails to load, shows text initials fallback.
 * Per design rules: never display broken or empty image URLs.
 */
export default function StoreCard({ store, className }: StoreCardProps) {
  return (
    <a
      href={store.base_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-center gap-4 p-4 rounded-xl border border-border bg-card',
        'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
        'transition-all duration-200 cursor-pointer',
        className
      )}
      aria-label={`Visit ${store.name}`}
    >
      {/* Store logo or initials fallback */}
      <StoreInitials name={store.name} />

      {/* Store info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{store.name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {store.base_url.replace(/^https?:\/\//, '')}
        </p>
      </div>

      {/* External link indicator */}
      <ExternalLink
        className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
        aria-hidden="true"
      />
    </a>
  );
}
