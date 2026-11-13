import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log('=== Increment 7A: Integrity & Invariants Audit ===');

  // Invariant 1: Canonical Products Count
  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`1. Total Products Count: ${productCount} (Invariant: strictly 822) -> ${productCount === 822 ? 'PASS' : 'FAIL'}`);

  // Invariant 2: Canonical Variants Count
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`2. Total Variants Count: ${variantCount} (Invariant: strictly 822) -> ${variantCount === 822 ? 'PASS' : 'FAIL'}`);

  // Invariant 3: Zero Duplicate (variant_id, store_id)
  const { data: allPrices } = await supabase.from('prices').select('variant_id, store_id, product_url, price, stores(slug, name)').limit(5000);
  const pairSet = new Set<string>();
  let duplicates = 0;
  for (const p of allPrices || []) {
    const key = `${p.variant_id}_${p.store_id}`;
    if (pairSet.has(key)) {
      duplicates++;
      console.log(`  DUPLICATE DETECTED: variant ${p.variant_id} on store ${p.store_id}`);
    }
    pairSet.add(key);
  }
  console.log(`3. Duplicate (variant_id, store_id) pairs in prices: ${duplicates} (Invariant: strictly 0) -> ${duplicates === 0 ? 'PASS' : 'FAIL'}`);

  // Invariant 4: No Constructed Fake URLs
  const fakeUrls = (allPrices || []).filter(p => {
    const url = p.product_url || '';
    return url.includes('fake') || url.includes('-i183471.html') || url.includes('metro.pk/products/') || (url.includes('carrefour.pk') && url.includes('-with-official-warranty'));
  });
  console.log(`4. Synthetic / Template Fake URLs detected: ${fakeUrls.length} (Invariant: strictly 0) -> ${fakeUrls.length === 0 ? 'PASS' : 'FAIL'}`);

  // Invariant 5: Sample Clickable URLs Audit
  console.log('\n--- Sample Newly Scraped Offers Audit ---');
  const sampleStores = ['daraz', 'naheed', 'al-fatah', 'paklap'];
  for (const s of sampleStores) {
    const { data: storeData } = await supabase.from('stores').select('id, name, slug').eq('slug', s).single();
    if (!storeData) continue;
    const { data: storePrices } = await supabase.from('prices').select('variant_id, price, product_url, updated_at').eq('store_id', storeData.id);
    console.log(`\nStore: ${storeData.name} (${s}) - Total real offers: ${storePrices?.length || 0}`);
    for (const p of storePrices || []) {
      console.log(` - Price: Rs. ${p.price.toLocaleString()} | URL: ${p.product_url}`);
    }
  }
}

run().catch(console.error);
