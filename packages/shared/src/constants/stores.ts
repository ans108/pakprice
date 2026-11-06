/**
 * Authoritative 12 configured stores for PakPrice.
 * Aligned with the database `stores` table sort_order and slugs.
 */

export interface ConfiguredStoreDefinition {
  id?: string;
  name: string;
  slug: string;
  tier: 1 | 2 | 3;
  sort_order: number;
  base_url: string;
  logo_url?: string | null;
  specialization?: 'laptops' | 'all' | 'hypermarket';
}

export const CONFIGURED_STORES: readonly ConfiguredStoreDefinition[] = [
  {
    name: 'Daraz',
    slug: 'daraz',
    tier: 2,
    sort_order: 1,
    base_url: 'https://www.daraz.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'PriceOye',
    slug: 'priceoye',
    tier: 1,
    sort_order: 2,
    base_url: 'https://priceoye.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'Mega.pk',
    slug: 'mega-pk',
    tier: 1,
    sort_order: 3,
    base_url: 'https://www.mega.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'Telemart',
    slug: 'telemart',
    tier: 1,
    sort_order: 4,
    base_url: 'https://www.telemart.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'Shophive',
    slug: 'shophive',
    tier: 1,
    sort_order: 5,
    base_url: 'https://www.shophive.com',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'HomeShopping',
    slug: 'homeshopping',
    tier: 2,
    sort_order: 6,
    base_url: 'https://www.homeshopping.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'Paklap',
    slug: 'paklap',
    tier: 2,
    sort_order: 7,
    base_url: 'https://www.paklap.pk',
    logo_url: null,
    specialization: 'laptops',
  },
  {
    name: 'iShopping',
    slug: 'ishopping',
    tier: 2,
    sort_order: 8,
    base_url: 'https://www.ishopping.pk',
    logo_url: null,
    specialization: 'all',
  },
  {
    name: 'Metro',
    slug: 'metro',
    tier: 3,
    sort_order: 9,
    base_url: 'https://www.metro.pk',
    logo_url: null,
    specialization: 'hypermarket',
  },
  {
    name: 'Carrefour',
    slug: 'carrefour',
    tier: 3,
    sort_order: 10,
    base_url: 'https://www.carrefour.pk',
    logo_url: null,
    specialization: 'hypermarket',
  },
  {
    name: 'Naheed',
    slug: 'naheed',
    tier: 3,
    sort_order: 11,
    base_url: 'https://www.naheed.pk',
    logo_url: null,
    specialization: 'hypermarket',
  },
  {
    name: 'Al-Fatah',
    slug: 'al-fatah',
    tier: 3,
    sort_order: 12,
    base_url: 'https://www.alfatah.com.pk',
    logo_url: null,
    specialization: 'hypermarket',
  },
] as const;

export type StoreCoverageStatus =
  | 'verified'
  | 'stale'
  | 'out_of_stock'
  | 'no_listing'
  | 'not_checked'
  | 'unsupported'
  | 'not_applicable';

export interface StoreCoverageItem {
  store: ConfiguredStoreDefinition;
  status: StoreCoverageStatus;
  statusLabel: string;
  subtext: string;
  price: number | null;
  inStock: boolean | null;
  isStale: boolean;
  productUrl: string | null;
  lastScrapedAt: string | null;
}
