import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-20-telemart-electronics.json');
  const pilotData = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));

  const beforePath = path.resolve(process.cwd(), 'scripts/pilot_audit_before.json');
  const beforeData = fs.existsSync(beforePath) ? JSON.parse(fs.readFileSync(beforePath, 'utf8')) : null;

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s: any) => [s.id, s]));

  console.log('========================================================================');
  console.log('AUDIT OF 20 TELEMART CANONICAL PRODUCTS (POST-BACKFILL VERIFICATION)');
  console.log('========================================================================\n');

  let totalOffersAfter = 0;
  const productAudits: any[] = [];

  for (let i = 0; i < pilotData.length; i++) {
    const p = pilotData[i];
    const { data: dbProduct } = await supabase
      .from('products')
      .select(`
        id, name, slug,
        product_variants (
          id, name,
          prices ( id, store_id, price, in_stock, last_scraped_at, product_url )
        )
      `)
      .eq('id', p.id)
      .single();

    const prices: any[] = [];
    for (const v of dbProduct?.product_variants || []) {
      for (const pr of v.prices || []) {
        const store = storeMap.get(pr.store_id);
        prices.push({
          variantId: v.id,
          variantName: v.name,
          storeSlug: store?.slug || pr.store_id,
          storeName: store?.name || 'Unknown',
          price: pr.price,
          inStock: pr.in_stock,
          url: pr.product_url,
        });
      }
    }

    totalOffersAfter += prices.length;
    const storeSlugs = Array.from(new Set(prices.map(pr => pr.storeSlug)));

    productAudits.push({
      index: i + 1,
      id: p.id,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      category: p.category || p.categorySlug,
      storesCount: storeSlugs.length,
      stores: storeSlugs,
      prices,
    });

    const indicator = storeSlugs.length > 1 ? '🟢 NEW STORE ATTACHED' : '⚪ Single store';
    console.log(
      `${(i + 1).toString().padStart(2, ' ')}. [${storeSlugs.join(', ')}] ${p.name.slice(0, 48)}... (${storeSlugs.length} store(s)) -> ${indicator}`
    );
  }

  const avgStoresAfter = (totalOffersAfter / pilotData.length).toFixed(2);
  console.log('\n------------------------------------------------------------------------');
  console.log(`Total Products:                  ${pilotData.length}`);
  console.log(`Total Offers Before:             ${beforeData?.totalOffersBefore ?? 'N/A'}`);
  console.log(`Total Offers After:              ${totalOffersAfter}`);
  console.log(`New Verified Offers Added:       ${totalOffersAfter - (beforeData?.totalOffersBefore ?? 20)}`);
  console.log(`Average Stores Before:           ${beforeData?.avgStores ?? '1.00'}`);
  console.log(`Average Stores After:            ${avgStoresAfter}`);
  console.log('========================================================================\n');

  fs.writeFileSync('scripts/pilot_audit_after.json', JSON.stringify({
    totalOffersBefore: beforeData?.totalOffersBefore ?? 20,
    totalOffersAfter,
    newOffersAdded: totalOffersAfter - (beforeData?.totalOffersBefore ?? 20),
    avgStoresBefore: beforeData?.avgStores ?? '1.00',
    avgStoresAfter,
    products: productAudits,
  }, null, 2));

  console.log('📄 Saved scripts/pilot_audit_after.json successfully.');
}

main().catch(console.error);
