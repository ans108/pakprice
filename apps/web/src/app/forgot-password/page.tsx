'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      const msg = resetError.message.toLowerCase();
      if (msg.includes('rate limit')) {
        setError('Too many requests. Please wait a few moments before requesting another link.');
      } else if (msg.includes('valid email')) {
        setError('Please enter a valid email address.');
      } else {
        setError('Unable to send reset link. Please verify your email and try again.');
      }
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="container-section py-20 flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-md bg-card p-8 rounded-2xl border border-border shadow-sm text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Check your email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            We sent a password reset link to {email}.
          </p>
          <Button asChild className="w-full" variant="outline">
            <Link href="/login">Return to Login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-section py-20 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl border border-border shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">Reset Password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              placeholder="you@example.com"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending link...' : 'Send Reset Link'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
