'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ProfileSection } from '@/components/account/ProfileSection';
import { FavoritesList } from '@/components/account/FavoritesList';
import { AlertsList } from '@/components/account/AlertsList';
import { SearchHistoryList } from '@/components/account/SearchHistoryList';
import { cn } from '@/utils/cn';

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (['profile', 'favorites', 'alerts', 'search'].includes(hash)) {
      setActiveTab(hash);
    }
  }, []);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    window.history.replaceState(null, '', `#${val}`);
  };

  const tabs = [
    { id: 'profile', label: 'Profile Details' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'alerts', label: 'Price Alerts' },
    { id: 'search', label: 'Search History' },
  ];

  return (
    <AuthGuard>
      <div className="container-section py-8 sm:py-12">
        <h1 className="text-3xl font-bold text-foreground mb-8">My Account</h1>

        <div className="w-full flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="flex flex-col h-auto bg-transparent items-start w-full md:w-64 shrink-0 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'w-full justify-start text-left px-4 py-3 rounded-md text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'profile' && <ProfileSection />}
            {activeTab === 'favorites' && <FavoritesList />}
            {activeTab === 'alerts' && <AlertsList />}
            {activeTab === 'search' && <SearchHistoryList />}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
