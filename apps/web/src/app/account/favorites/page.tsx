'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { FavoritesList } from '@/components/account/FavoritesList';

export default function AccountFavoritesPage() {
  return (
    <AuthGuard>
      <div className="container-section py-8 sm:py-12 max-w-4xl">
        <div className="mb-6">
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Account Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Saved Favorites</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and compare the lowest listed prices for your saved products and configurations.
          </p>
        </div>

        <FavoritesList />
      </div>
    </AuthGuard>
  );
}
