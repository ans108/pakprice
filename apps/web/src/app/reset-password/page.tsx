'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Optional: check if the user has a valid session/recovery token
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError('Invalid or expired password reset link. Please request a new one.');
      }
    });
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      const msg = updateError.message.toLowerCase();
      if (msg.includes('least') || msg.includes('weak') || msg.includes('short')) {
        setError('Password is too weak. It must be at least 6 characters long.');
      } else if (msg.includes('same')) {
        setError('New password must be different from your previous password.');
      } else {
        setError('Unable to update password. Your reset session may have expired.');
      }
      setLoading(false);
    } else {
      router.push('/login?message=Password updated successfully');
    }
  };

  return (
    <div className="container-section py-20 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl border border-border shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">Update Password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter your new password below.
        </p>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">
              New Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || !!error}>
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
