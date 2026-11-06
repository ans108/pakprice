import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/AppProviders';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pakprice.pk';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'PakPrice — Compare Prices Across Pakistan\'s Top Stores',
    template: '%s | PakPrice',
  },
  description:
    'PakPrice is Pakistan\'s smart price comparison platform. Compare prices across Daraz, PriceOye, Telemart, Shophive, and 8+ more stores. Find the best deals on electronics, gadgets, and appliances.',
  keywords: [
    'price comparison Pakistan',
    'Pakistan shopping',
    'best prices Pakistan',
    'Daraz prices',
    'PriceOye',
    'online shopping Pakistan',
    'cheap prices Pakistan',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_PK',
    url: siteUrl,
    siteName: 'PakPrice',
    title: 'PakPrice — Compare Prices Across Pakistan\'s Top Stores',
    description:
      'Find the best deals on electronics, gadgets, and appliances across 12+ Pakistani stores in one place.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PakPrice — Compare Prices Across Pakistan\'s Top Stores',
    description:
      'Find the best deals on electronics, gadgets, and appliances across 12+ Pakistani stores in one place.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <AppProviders>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 pt-16">{children}</main>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
