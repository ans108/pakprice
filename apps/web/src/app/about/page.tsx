import type { Metadata } from 'next';
import { TrendingDown, Target, Users, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About PakPrice — Pakistan\'s Price Comparison Platform',
  description:
    'Learn about PakPrice, our mission to help Pakistani consumers find the best prices across the country\'s top online stores.',
  alternates: { canonical: '/about' },
  openGraph: { url: '/about' },
};

export default function AboutPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="container-section max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <TrendingDown className="w-8 h-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            About PakPrice
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We&apos;re building Pakistan&apos;s most comprehensive price comparison platform so
            every consumer can make smarter buying decisions.
          </p>
        </div>

        {/* Mission cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: Target,
              title: 'Our Mission',
              description:
                'Empower every Pakistani consumer with real-time price data to make informed purchasing decisions.',
            },
            {
              icon: Users,
              title: 'Who We Serve',
              description:
                'Students, families, and businesses who want to stretch their rupees further in Pakistan.',
            },
            {
              icon: Heart,
              title: 'Our Values',
              description:
                'Transparency, accuracy, and user privacy. We never sell your data or manipulate results.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-border bg-card text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <h2 className="font-semibold mb-2">{item.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>

        {/* Story */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold mb-4">Our Story</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            PakPrice was born out of a frustration familiar to every Pakistani shopper: spending
            hours visiting multiple websites to find the best price for a product, only to discover
            after purchasing that it was cheaper elsewhere.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We set out to solve this problem by building a platform that aggregates prices from
            Pakistan&apos;s top stores — Daraz, PriceOye, Telemart, Shophive, and more — in one
            clean, easy-to-use interface.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We&apos;re currently in active development. Phase 1 establishes the foundation, and
            product search, price comparison, and price alerts are coming very soon.
          </p>
        </div>
      </div>
    </div>
  );
}
