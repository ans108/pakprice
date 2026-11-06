'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { User, LogOut, Heart, Settings, Bell } from 'lucide-react';
import { cn } from '@/utils/cn';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative z-50">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 px-2"
        onClick={() => setOpen(!open)}
      >
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <User className="w-4 h-4" />
        </div>
        <span className="hidden sm:inline-block max-w-[120px] truncate text-sm font-medium">
          {user.email}
        </span>
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg p-2 z-50 animate-in fade-in slide-in-from-top-2">
            <div className="px-3 py-2 border-b border-border mb-2">
              <p className="text-sm font-medium text-foreground truncate">Account</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            
            <MenuLink href="/account" icon={<Settings className="w-4 h-4" />} onClick={() => setOpen(false)}>
              Dashboard
            </MenuLink>
            <MenuLink href="/account#favorites" icon={<Heart className="w-4 h-4" />} onClick={() => setOpen(false)}>
              Favorites
            </MenuLink>
            <MenuLink href="/account#alerts" icon={<Bell className="w-4 h-4" />} onClick={() => setOpen(false)}>
              Price Alerts
            </MenuLink>
            
            <div className="my-1 border-t border-border" />
            
            <button
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 hover:text-red-600 rounded-md transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ href, icon, children, onClick }: { href: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
