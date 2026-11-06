import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';
import { normalizeProductName } from '@pakprice/shared';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'apps/api/.env') });
dotenv.config({ path: path.join(process.cwd(), 'apps/web/.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl!, supabaseKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== Increment 6D: Cross-Store Match Repair ===\n');

  // Step 1: Update normalized_name for any products that differ from current normalizeProductName
  console.log('Step 1: Synchronizing products.normalized_name across catalog...');
  const { data: prods } = await db.from('products').select('id, name, normalized_name');
  let updatedCount = 0;
  for (const p of prods || []) {
    const computed = normalizeProductName(p.name);
    if (computed !== p.normalized_name) {
      await db.from('products').update({ normalized_name: computed }).eq('id', p.id);
      updatedCount++;
    }
  }
  console.log(`Updated ${updatedCount} products with current normalized_name.\n`);

  // Step 2: Get Telemart store ID
  const { data: telemartStore } = await db.from('stores').select('id, slug').eq('slug', 'telemart').single();
  if (!telemartStore) throw new Error('Telemart store not found');
  const telemartStoreId = telemartStore.id;
  console.log(`Telemart Store ID: ${telemartStoreId}\n`);

  // Step 3: Run real PriceIngestionService for Zero Luna and Zero Ignite
  const ingestionService = new PriceIngestionService();

  const lunaTelemart: ScrapedProductSchemaType = {
    name: 'Zero Luna Smartwatch',
    price: 5999,
    originalPrice: 12999,
    inStock: true,
    sourceUrl: 'https://www.telemart.pk/products/zero-luna-smartwatch',
    sourceIdentifier: '9621955674332',
    sourceIdentifierType: 'product_id',
    modelNumber: 'TM-LUNA-1',
    sku: 'TM-Luna-1',
    brand: 'Zero',
    category: 'smart-watches',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0830/0897/9164/files/Untitleddesign-2026-09-15T133722.234.jpg?v=1789461536',
    scrapedAt: new Date(),
  };

  const igniteTelemart: ScrapedProductSchemaType = {
    name: 'Zero Ignite Smartwatch',
    price: 5999,
    originalPrice: 12999,
    inStock: true,
    sourceUrl: 'https://www.telemart.pk/products/zero-ignite-smartwatch',
    sourceIdentifier: '9621960294620',
    sourceIdentifierType: 'product_id',
    modelNumber: 'TM-IGNITE-1',
    sku: 'TM-Ignite-1',
    brand: 'Zero',
    category: 'smart-watches',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0830/0897/9164/files/Untitleddesign-2026-09-15T135334.153.jpg?v=1789462675',
    scrapedAt: new Date(),
  };

  console.log('Step 2: Ingesting Telemart Zero Luna via real PriceIngestionService...');
  const resLuna = await ingestionService.ingest(lunaTelemart, telemartStoreId, false);
  console.log('Zero Luna Ingestion Result:', JSON.stringify(resLuna, null, 2));

  console.log('\nStep 3: Ingesting Telemart Zero Ignite via real PriceIngestionService...');
  const resIgnite = await ingestionService.ingest(igniteTelemart, telemartStoreId, false);
  console.log('Zero Ignite Ingestion Result:', JSON.stringify(resIgnite, null, 2));

  // Step 4: Verification of matched variants and prices
  console.log('\nStep 4: Inspecting canonical variants in database:');
  const canonicalLunaVariantId = '31609039-4ae4-44f4-8fe4-498fa4e29ce3';
  const canonicalIgniteVariantId = '1e4e35dd-88f2-461f-99db-856c003d1a8d';

  for (const [name, variantId] of [['Zero Luna', canonicalLunaVariantId], ['Zero Ignite', canonicalIgniteVariantId]]) {
    const { data: prices } = await db
      .from('prices')
      .select('id, store_id, price, original_price, in_stock, stores(slug, name)')
      .eq('variant_id', variantId);
    console.log(`\n${name} (Variant: ${variantId}) Prices:`);
    for (const pr of prices || []) {
      console.log(`  - Store: ${(pr.stores as any)?.name} (${(pr.stores as any)?.slug}) | Rs. ${pr.price} | InStock: ${pr.in_stock}`);
    }
  }

  // Step 5: Full Multi-Store Audit
  console.log('\nStep 5: Running Live Multi-Store Audit across DB:');
  const { data: allVariants } = await db
    .from('product_variants')
    .select(`
      id, name,
      products ( id, name, slug ),
      prices ( store_id, price, in_stock, stores ( slug, name ) )
    `);

  let singleStoreCount = 0;
  let twoStoreCount = 0;
  let threeStoreCount = 0;
  let fourPlusStoreCount = 0;
  const multiStoreVariants: any[] = [];
  const storePairs: Record<string, number> = {};

  for (const v of allVariants || []) {
    const prices = v.prices || [];
    const distinctStores = new Set(prices.map((p: any) => p.stores?.slug).filter(Boolean));
    const count = distinctStores.size;

    if (count === 1) singleStoreCount++;
    else if (count === 2) twoStoreCount++;
    else if (count === 3) threeStoreCount++;
    else if (count >= 4) fourPlusStoreCount++;

    if (count >= 2) {
      multiStoreVariants.push({
        variantId: v.id,
        productName: (v.products as any)?.name,
        stores: Array.from(distinctStores),
      });

      // record store pairs
      const storeList = Array.from(distinctStores).sort();
      for (let i = 0; i < storeList.length; i++) {
        for (let j = i + 1; j < storeList.length; j++) {
          const pairKey = `${storeList[i]} ↔ ${storeList[j]}`;
          storePairs[pairKey] = (storePairs[pairKey] || 0) + 1;
        }
      }
    }
  }

  const totalVerified = twoStoreCount + threeStoreCount + fourPlusStoreCount;
  console.log('\n========================================');
  console.log('       MULTI-STORE AUDIT REPORT        ');
  console.log('========================================');
  console.log(`Total Variants:             ${allVariants?.length}`);
  console.log(`1 store:                    ${singleStoreCount}`);
  console.log(`2 stores:                   ${twoStoreCount}`);
  console.log(`3 stores:                   ${threeStoreCount}`);
  console.log(`4+ stores:                  ${fourPlusStoreCount}`);
  console.log(`TOTAL VERIFIED MULTI-STORE: ${totalVerified}`);
  console.log('----------------------------------------');
  console.log('Verified Multi-Store Variants:');
  for (const mv of multiStoreVariants) {
    console.log(`  * ${mv.productName} [${mv.variantId}]: [${mv.stores.join(', ')}]`);
  }
  console.log('----------------------------------------');
  console.log('Store-Pair Distribution:');
  for (const [pair, cnt] of Object.entries(storePairs)) {
    console.log(`  * ${pair}: ${cnt}`);
  }
  console.log('========================================\n');
}

main().catch(console.error);
