import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeProductName, calculateStringSimilarity } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function findCandidates() {
  console.log('=== FINDING TARGETS FROM PRICED CATALOG ===\n');

  const { data: prods } = await supabase.from('products').select(`
    id, name, normalized_name,
    categories ( slug ),
    product_variants (
      id, name, model_number, ram_gb, storage_gb,
      prices ( store_id, price, stores(slug) )
    )
  `);

  const pricedItems: any[] = [];
  for (const p of prods || []) {
    for (const v of p.product_variants || []) {
      const activePrices = v.prices || [];
      if (activePrices.length > 0) {
        pricedItems.push({
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          variantName: v.name,
          category: (p.categories as any)?.slug,
          modelNumber: v.model_number,
          ram: v.ram_gb,
          storage: v.storage_gb,
          stores: activePrices.map((pr: any) => pr.stores?.slug),
          prices: activePrices.map((pr: any) => pr.price),
        });
      }
    }
  }

  console.log(`Total priced variants in DB: ${pricedItems.length}`);

  // Filter for laptops and smartwatches and mobiles
  const targetCategories = ['laptops', 'smart-watches', 'mobiles'];
  const targets = pricedItems.filter(i => targetCategories.includes(i.category));
  console.log(`Priced variants in target categories: ${targets.length}`);

  console.log('\nTop 40 Priced Candidates:');
  for (const t of targets.slice(0, 40)) {
    console.log(`- [${t.category}] "${t.productName}" | stores: ${t.stores.join(', ')} | Rs. ${t.prices.join(', ')}`);
  }
}

findCandidates().catch(console.error);
