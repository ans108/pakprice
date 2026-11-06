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

  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map((s: any) => [s.id, s]));

  console.log('========================================================================');
  console.log('AUDIT OF 20 TELEMART-ONLY CANONICAL PRODUCTS (PRE-BACKFILL BASELINE)');
  console.log('========================================================================\n');

  let totalOffersBefore = 0;
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

    totalOffersBefore += prices.length;
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

    console.log(
      `${(i + 1).toString().padStart(2, ' ')}. [${storeSlugs.join(', ')}] ${p.name.slice(0, 50)}... (${storeSlugs.length} store(s))`
    );
  }

  const avgStores = (totalOffersBefore / pilotData.length).toFixed(2);
  console.log('------------------------------------------------------------------------');
  console.log(`Total Products:                  ${pilotData.length}`);
  console.log(`Total Offers Before:             ${totalOffersBefore}`);
  console.log(`Average Stores Per Product:      ${avgStores}`);
  console.log('========================================================================\n');

  fs.writeFileSync('scripts/pilot_audit_before.json', JSON.stringify({
    totalOffersBefore,
    avgStores,
    products: productAudits,
  }, null, 2));
}

main().catch(console.error);
