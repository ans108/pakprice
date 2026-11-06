import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bank & Card Offers | PakPrice',
  description: 'Explore credit and debit card discounts, cashbacks, and special installment offers from major Pakistani banks.',
  openGraph: {
    title: 'Bank & Card Offers | PakPrice',
    description: 'Explore credit and debit card discounts, cashbacks, and special installment offers from major Pakistani banks.',
    type: 'website',
  },
};

export default function BankOffersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
