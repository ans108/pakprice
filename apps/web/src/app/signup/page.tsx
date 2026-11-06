'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/account';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        }
      }
    });

    if (signUpError) {
      const msg = signUpError.message.toLowerCase();
      if (msg.includes('user already registered') || msg.includes('already exists') || msg.includes('already registered')) {
        setError('An account with this email address already exists. Please sign in instead.');
      } else if (msg.includes('password') && msg.includes('least')) {
        setError('Password is too weak. It must be at least 6 characters long.');
      } else if (msg.includes('valid email')) {
        setError('Please enter a valid email address.');
      } else {
        setError(signUpError.message || 'Unable to create account. Please try again.');
      }
      setLoading(false);
    } else {
      if (data.session) {
        // Automatically signed in
        router.push(redirectUrl);
      } else {
        // Email verification required
        setSuccess(true);
        setLoading(false);
      }
    }
  };

  if (success) {
    return (
      <div className="container-section py-20 flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-md bg-card p-8 rounded-2xl border border-border shadow-sm text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Check your email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            We sent a verification link to {email}. Please verify your email to continue.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full" variant="outline">
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-section py-20 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl border border-border shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">Create Account</h1>
        <p className="text-sm text-muted-foreground mb-6">Join PakPrice to track prices and save</p>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="name">
              Name (Optional)
            </label>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              placeholder="John Doe"
            />
          </div>

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

          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="password">
              Password
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
            <p className="text-xs text-muted-foreground mt-1">Must be at least 6 characters</p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href={`/login?redirect=${encodeURIComponent(redirectUrl)}`} className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
