import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verified Coupons & Promo Codes | PakPrice',
  description: 'Find verified discount vouchers, promo codes, and store deals across leading Pakistani e-commerce retailers.',
  openGraph: {
    title: 'Coupons & Promo Codes | PakPrice',
    description: 'Find verified discount vouchers, promo codes, and store deals across leading Pakistani e-commerce retailers.',
    type: 'website',
  },
};

export default function CouponsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
