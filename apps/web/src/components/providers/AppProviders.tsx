'use client';

import React from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/AuthContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { CompareProvider } from '@/contexts/CompareContext';
import { CompareBar } from '@/components/compare/CompareBar';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <FavoritesProvider>
          <CompareProvider>
            {children}
            <CompareBar />
          </CompareProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
