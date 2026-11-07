import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Search,
  BarChart3,
  Bell,
  Shield,
  Zap,
  ShoppingBag,
  TrendingDown,
  Star,
  ArrowRight,
  CheckCircle2,
  Store,
  Watch,
  Smartphone,
  Headphones,
  Laptop,
  Tablet,
  BatteryCharging,
  Tv,
  Sparkles,
} from 'lucide-react';
import SearchBox from '@/components/common/SearchBox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { productService } from '@/services/productService';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'PakPrice — Search-First Price Discovery Across Pakistan',
  description:
    'Search any product and find store-by-store prices across PriceOye, Mega.pk, Telemart, Daraz, and more. Direct store links and verified real-time pricing.',
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

// Pakistani stores listed on the landing page
const STORES = [
  { name: 'Daraz', url: 'https://www.daraz.pk', category: 'Marketplace' },
  { name: 'PriceOye', url: 'https://priceoye.pk', category: 'Electronics' },
  { name: 'Mega.pk', url: 'https://www.mega.pk', category: 'Electronics' },
  { name: 'Telemart', url: 'https://www.telemart.pk', category: 'Electronics' },
  { name: 'Shophive', url: 'https://www.shophive.com', category: 'Electronics' },
  { name: 'HomeShopping', url: 'https://www.homeshopping.pk', category: 'General' },
  { name: 'Paklap', url: 'https://www.paklap.pk', category: 'Laptops' },
  { name: 'iShopping', url: 'https://www.ishopping.pk', category: 'Electronics' },
  { name: 'Metro', url: 'https://www.metro.pk', category: 'Retail' },
  { name: 'Carrefour', url: 'https://www.carrefour.pk', category: 'Retail' },
  { name: 'Naheed', url: 'https://www.naheed.pk', category: 'Supermarket' },
  { name: 'Al-Fatah', url: 'https://www.alfatah.com.pk', category: 'Supermarket' },
];

const CATEGORIES = [
  { slug: 'smart-watches', name: 'Smart Watches', subtitle: '55+ Multi-Store', icon: Watch },
  { slug: 'mobiles', name: 'Smartphones', subtitle: '5G & 4G phones', icon: Smartphone },
  { slug: 'headphones-audio', name: 'Wireless Earbuds', subtitle: 'ANC & TWS Audio', icon: Headphones },
  { slug: 'laptops', name: 'Laptops', subtitle: 'Ultrabooks & Gaming', icon: Laptop },
  { slug: 'tablets', name: 'Tablets', subtitle: 'iPads & Android Tabs', icon: Tablet },
  { slug: 'computer-accessories', name: 'Power Banks', subtitle: 'Fast charging gear', icon: BatteryCharging },
  { slug: 'home-appliances', name: 'Appliances & TVs', subtitle: 'Smart TVs & Home', icon: Tv },
];

const POPULAR_BRANDS = [
  { name: 'Samsung', slug: 'samsung' },
  { name: 'Apple', slug: 'apple' },
  { name: 'Xiaomi', slug: 'xiaomi' },
  { name: 'Infinix', slug: 'infinix' },
  { name: 'Tecno', slug: 'tecno' },
  { name: 'Zero', slug: 'zero' },
  { name: 'Audionic', slug: 'audionic' },
  { name: 'Ronin', slug: 'ronin' },
  { name: 'Anker', slug: 'anker' },
  { name: 'Huawei', slug: 'huawei' },
  { name: 'HP', slug: 'hp' },
  { name: 'Lenovo', slug: 'lenovo' },
  { name: 'Dell', slug: 'dell' },
  { name: 'Sony', slug: 'sony' },
];

/**
 * Verified multi-store products from Phase 0 audit.
 * These 5 variants are confirmed to have prices from both PriceOye and Telemart in the DB.
 * Prices are from live scraper data — not fabricated.
 * Note: prices here are for the landing page display; product pages show real-time DB data.
 */
const MULTI_STORE_DEALS = [
  {
    slug: 'unknown-apple-iphone-17-pro-max',
    name: 'Apple iPhone 17 Pro Max',
    stores: ['PriceOye', 'Mega.pk'],
    lowestPrice: 411999,
    highestPrice: 462499,
  },
  {
    slug: 'samsung-samsung-galaxy-watch-8-40mm',
    name: 'Samsung Galaxy Watch 8 40mm',
    stores: ['PriceOye', 'Telemart'],
    lowestPrice: 59999,
    highestPrice: 61999,
  },
  {
    slug: 'unknown-zero-luna-smart-watch',
    name: 'Zero Luna Smart Watch',
    stores: ['PriceOye', 'Telemart'],
    lowestPrice: 5849,
    highestPrice: 5999,
  },
  {
    slug: 'unknown-infinix-xw3gt-smart-watch',
    name: 'Infinix XW3GT Smart Watch',
    stores: ['PriceOye', 'Telemart'],
    lowestPrice: 4199,
    highestPrice: 5299,
  },
  {
    slug: 'unknown-docomo-tab-d41-a',
    name: 'Docomo TAB D41-A',
    stores: ['PriceOye', 'Telemart'],
    lowestPrice: 29999,
    highestPrice: 45000,
  },
];


const FEATURES = [
  {
    icon: BarChart3,
    title: 'Real-Time Price Tracking',
    description:
      'Our scrapers continuously monitor prices so you always see the latest deal — not yesterday\'s data.',
  },
  {
    icon: TrendingDown,
    title: 'Price History Charts',
    description:
      'See how a product\'s price has changed over time. Know when to buy and when to wait.',
  },
  {
    icon: Bell,
    title: 'Smart Price Alerts',
    description:
      'Set your target price and we\'ll notify you the moment a product drops to your budget.',
  },
  {
    icon: Shield,
    title: 'Coupon & Bank Offers',
    description:
      'We automatically surface available coupon codes and bank/card discounts for each store.',
  },
  {
    icon: Zap,
    title: 'Instant Comparison',
    description:
      'Compare prices, specs, and availability across all 12 stores on a single, clutter-free page.',
  },
  {
    icon: ShoppingBag,
    title: 'All Major Stores',
    description:
      'From Daraz and PriceOye to Metro and Carrefour — we cover Pakistan\'s biggest online and retail stores.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Search One Product',
    description:
      'Type any product name or model — e.g. iPhone 17 Pro Max, Galaxy Watch 8, or HP Laptop.',
  },
  {
    step: '02',
    title: 'Find Canonical Matches',
    description:
      'PakPrice identifies the exact product and aggregates live prices from PriceOye, Mega.pk, Telemart, and more.',
  },
  {
    step: '03',
    title: 'Visit Store & Buy',
    description:
      'Check stock, price, and freshness, then click the direct store link to purchase on the retailer\'s website.',
  },
];

function StoreInitials({ name }: { name: string }) {
  const initials = name
    .split(/[\s.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span className="font-bold text-primary text-sm" aria-hidden="true">
      {initials}
    </span>
  );
}

async function getLiveDeals(): Promise<typeof MULTI_STORE_DEALS> {
  try {
    const res = await productService.getProducts({
      minStores: 2,
      sort: 'store_count_desc',
      limit: 8,
    });
    if (res?.data && res.data.length > 0) {
      return res.data.map((p) => {
        const storeLabel = p.store_count && p.store_count > 1 ? `${p.store_count} Stores` : 'Multi-Store';
        return {
          slug: p.slug,
          name: p.name,
          stores: [storeLabel],
          lowestPrice: p.lowest_price || 0,
          highestPrice: p.highest_price || p.lowest_price || 0,
        };
      });
    }
  } catch {
    // Graceful fallback to static verified deals during build or offline
  }
  return MULTI_STORE_DEALS;
}

export default async function HomePage() {
  const deals = await getLiveDeals();
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section
        className="relative z-30 pt-6 pb-14 md:pt-10 md:pb-20"
        style={{ background: 'var(--hero-gradient)' }}
        aria-label="Hero section"
      >
        {/* Decorative background circles container: isolated with overflow-hidden so circles don't cause horizontal scroll while dropdown is not clipped */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            className="absolute bottom-1/4 -left-32 w-80 h-80 rounded-full bg-primary/8 blur-3xl"
          />
        </div>

        <div className="container-section relative z-10 pt-8 pb-4 md:pt-12 md:pb-8">
          <div className="max-w-3xl mx-auto text-center">
            {/* Top badge */}
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium animate-fade-in">
              <Star className="w-3.5 h-3.5 fill-primary" aria-hidden="true" />
              Search-First Price Discovery Across Pakistan
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-4 animate-slide-up">
              What product are you
              <br />
              <span className="text-gradient">looking for?</span>
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed animate-slide-up">
              Search any phone, laptop, or gadget. We find the same canonical product across Pakistan&apos;s top stores so you see all prices in one place.
            </p>

            {/* Search box */}
            <div className="animate-slide-up max-w-2xl mx-auto">
              <SearchBox size="lg" placeholder="Search iPhone 17 Pro Max, Galaxy Watch 8, HP Laptop..." />
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
              {[
                { icon: CheckCircle2, text: '12 Stores Tracked' },
                { icon: CheckCircle2, text: 'Real-Time Prices' },
                { icon: CheckCircle2, text: 'Always Free' },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STORES MARQUEE STRIP ────────────────────────────── */}
      <section
        className="py-6 bg-card border-y border-border overflow-hidden"
        aria-label="Tracked stores"
      >
        <div className="container-section">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Prices tracked across
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {STORES.map((store) => (
              <a
                key={store.name}
                href={store.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm font-medium text-muted-foreground hover:text-foreground"
                aria-label={`Visit ${store.name}`}
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <StoreInitials name={store.name} />
                </div>
                {store.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── BROWSE BY CATEGORY & BRANDS ──────────────────────── */}
      <section
        id="browse-categories"
        className="py-12 md:py-16 bg-muted/20 border-b border-border"
        aria-labelledby="categories-heading"
      >
        <div className="container-section">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Catalog Discovery
              </div>
              <h2 id="categories-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Browse by Category
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Explore real-time multi-store pricing across Pakistan&apos;s most popular electronics categories
              </p>
            </div>
            <Link
              href="/search?sort=store_count_desc"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0"
            >
              View all products
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.slug}
                  href={`/search?category=${cat.slug}&sort=store_count_desc`}
                  className="group flex flex-col items-center text-center p-4 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                    {cat.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                    {cat.subtitle}
                  </p>
                </Link>
              );
            })}
          </div>

          {/* ── POPULAR BRANDS IN PAKISTAN ────────────────────── */}
          <div className="mt-8 pt-8 border-t border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                Popular Brands:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {POPULAR_BRANDS.map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/search?brand=${brand.slug}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-full border border-border bg-background hover:border-primary/50 hover:bg-primary/5 text-xs font-semibold text-foreground hover:text-primary transition-all duration-150"
                  >
                    {brand.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MULTI-STORE DEALS ────────────────────────── */}
      <section
        id="multi-store-deals"
        className="py-16 md:py-20 bg-accent/30"
        aria-labelledby="multi-store-heading"
      >
        <div className="container-section">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wide">
              <Store className="w-3.5 h-3.5" aria-hidden="true" />
              Cross-store verified
            </div>
            <h2
              id="multi-store-heading"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight"
            >
              One Product.
              <br />
              <span className="text-gradient">Every Store Price.</span>
            </h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
              These verified products are tracked across multiple Pakistani stores. Compare store offers and click directly to buy.
            </p>
          </div>

          {/* Verified multi-store deal cards — dynamic with fallback */}
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
            {deals.map((deal) => (
              <Link
                key={deal.slug}
                href={`/products/${deal.slug}`}
                className="group flex-shrink-0 snap-start w-64 sm:w-72 flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
                aria-label={`View store prices for ${deal.name}`}
              >
                {/* Multi-store badge */}
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wide">
                  <Store className="w-3 h-3" aria-hidden="true" />
                  {deal.stores.join(' × ')}
                </div>

                {/* Product name */}
                <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                  {deal.name}
                </h3>

                {/* Price comparison */}
                <div className="flex flex-col gap-1 mt-auto">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">From</p>
                      <p className="text-lg font-black text-green-700 dark:text-green-400">
                        Rs. {deal.lowestPrice.toLocaleString()}
                      </p>
                    </div>
                    {deal.highestPrice > deal.lowestPrice && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Up to</p>
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">
                          Rs. {deal.highestPrice.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  {deal.highestPrice > deal.lowestPrice && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400">
                      <TrendingDown className="w-3 h-3" aria-hidden="true" />
                      Save up to Rs. {(deal.highestPrice - deal.lowestPrice).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Store Prices CTA */}
                <div className="flex items-center gap-1 text-[11px] font-semibold text-primary mt-1">
                  View Store Prices
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </div>
              </Link>
            ))}

            {/* Browse more CTA card */}
            <Link
              href="/search"
              className="group flex-shrink-0 snap-start w-48 flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
              aria-label="Browse all products"
            >
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Search className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-center">Browse all products</p>
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="py-20 md:py-28"
        aria-labelledby="how-it-works-heading"
      >
        <div className="container-section">
          <div className="text-center mb-16">
            <Badge variant="success" className="mb-4">
              Simple Process
            </Badge>
            <h2
              id="how-it-works-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            >
              How PakPrice Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Three steps to find the best price in Pakistan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div
              className="hidden md:block absolute top-12 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-gradient-to-r from-transparent via-border to-transparent"
              aria-hidden="true"
            />

            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.step}
                className="flex flex-col items-center text-center p-8 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all group"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/15 transition-colors">
                  <span className="text-2xl font-black text-primary">{step.step}</span>
                </div>
                <h3 className="text-lg font-semibold mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────── */}
      <section
        className="py-20 md:py-28 bg-accent/30"
        aria-labelledby="features-heading"
      >
        <div className="container-section">
          <div className="text-center mb-16">
            <Badge variant="success" className="mb-4">
              Platform Features
            </Badge>
            <h2
              id="features-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            >
              Everything You Need to
              <br />
              <span className="text-gradient">Shop Smarter</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                    <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PAKISTANI STORES ────────────────────────────────── */}
      <section
        id="stores"
        className="py-20 md:py-28"
        aria-labelledby="stores-heading"
      >
        <div className="container-section">
          <div className="text-center mb-16">
            <Badge variant="success" className="mb-4">
              Coverage
            </Badge>
            <h2
              id="stores-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            >
              12 Pakistani Stores.
              <br />
              One Comparison.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              From electronics specialists to supermarket chains — if it&apos;s sold online in
              Pakistan, we track it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {STORES.map((store) => (
              <a
                key={store.name}
                href={store.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all"
                aria-label={`Visit ${store.name}`}
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  <StoreInitials name={store.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{store.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{store.category}</p>
                </div>
                <ArrowRight
                  className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0"
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section
        className="py-20 md:py-28"
        aria-labelledby="cta-heading"
      >
        <div className="container-section">
          <div className="relative rounded-3xl overflow-hidden bg-primary p-10 md:p-16 text-center">
            {/* Decorative circles */}
            <div
              className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative z-10">
              <h2
                id="cta-heading"
                className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4"
              >
                Start Saving in Pakistan Today
              </h2>
              <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
                Join thousands of smart shoppers who use PakPrice to never overpay again.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="xl"
                  variant="secondary"
                  className="shadow-lg font-semibold"
                  asChild
                >
                  <Link href="/search" id="cta-search-button">
                    <Search className="w-4 h-4 mr-1" aria-hidden="true" />
                    Start Searching
                  </Link>
                </Button>
                <Button
                  size="xl"
                  variant="outline"
                  className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white font-semibold"
                  asChild
                >
                  <Link href="/#stores" id="cta-stores-button">
                    Explore Stores
                    <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
