import Link from 'next/link';
import type { Metadata } from 'next';
import { Search, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <span className="text-8xl font-black text-gradient select-none">404</span>
        </div>
        <h1 className="text-2xl font-bold mb-3">Page Not Found</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist, or it may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild id="not-found-home-button">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" aria-hidden="true" />
              Go Home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Search className="w-4 h-4 mr-2" aria-hidden="true" />
              Search Products
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
