import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Account | PakPrice',
  description: 'Manage your PakPrice account, saved favorites, price alerts, and search history.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
