import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const matcher = new ProductMatcher();

async function testMatch() {
  const scraped = {
    storeSlug: 'shophive',
    sourceUrl: 'https://www.shophive.com/samsung-galaxy-a07-4gb-64gb/',
    sourceIdentifier: 'samsung-galaxy-a07-4gb-64gb',
    sourceIdentifierType: 'url_slug' as const,
    name: 'Samsung Galaxy A07 4GB 64GB',
    brand: 'Samsung',
    modelNumber: null,
    sku: null,
    gtin: null,
    description: null,
    imageUrl: null,
    price: 36499,
    originalPrice: null,
    discountPercent: null,
    shippingFee: 0,
    inStock: true,
    stockCount: null,
    ramGb: 4,
    storageGb: 64,
    color: null,
  };

  const res = await matcher.match(scraped);
  console.log('Match result:', {
    status: res.status,
    method: res.method,
    product: res.product?.name,
    variantId: res.variant?.id,
    variantRam: res.variant?.ram_gb,
    variantStorage: res.variant?.storage_gb,
    reason: res.reason
  });
}

testMatch();

