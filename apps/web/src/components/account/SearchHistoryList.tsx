'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/axios';
import { Loader2, Trash2, Search, History } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SearchHistoryList() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v1/search-history');
      setHistory(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const removeHistoryItem = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/search-history/${id}`);
      setHistory(history.filter(h => h.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllHistory = async () => {
    try {
      await apiClient.delete('/api/v1/search-history');
      setHistory([]);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (history.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <History className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">No search history</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your recent searches will appear here.
        </p>
        <Button asChild>
          <Link href="/search">Start Searching</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">Search History</h2>
        <Button variant="ghost" size="sm" onClick={clearAllHistory} className="text-muted-foreground hover:text-red-500">
          Clear All
        </Button>
      </div>

      <div className="divide-y divide-border">
        {history.map((item) => (
          <div key={item.id} className="py-3 flex items-center justify-between gap-4 group">
            <Link 
              href={`/search?q=${encodeURIComponent(item.query)}`}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {item.query}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  {item.result_count !== null && (
                    <>
                      <span>•</span>
                      <span>{item.result_count} result{item.result_count !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>
              </div>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
              onClick={() => removeHistoryItem(item.id)}
              aria-label="Remove search history"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
