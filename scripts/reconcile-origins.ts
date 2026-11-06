import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  const { data: stores } = await supabase.from('stores').select('id, slug');

  for (const s of stores || []) {
    const { data: p } = await supabase
      .from('prices')
      .select('id, created_at')
      .eq('store_id', s.id)
      .order('created_at', { ascending: true });

    if (p && p.length > 0) {
      console.log(`Store: ${s.slug.padEnd(10)} | total prices: ${p.length} | earliest: ${p[0].created_at} | latest: ${p[p.length - 1].created_at}`);
    } else {
      console.log(`Store: ${s.slug.padEnd(10)} | total prices: 0`);
    }
  }

  // Check product created_at distribution
  const { data: products } = await supabase
    .from('products')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(1000);

  console.log(`\nTotal products fetched: ${products?.length}`);
  if (products && products.length > 0) {
    console.log(`Products earliest: ${products[0].created_at}`);
    console.log(`Products latest:   ${products[products.length - 1].created_at}`);
    
    // Group products by day/hour
    const pre6BProducts = products.filter(pr => new Date(pr.created_at) < new Date('2026-09-21T00:00:00Z'));
    const post6BProducts = products.filter(pr => new Date(pr.created_at) >= new Date('2026-09-21T00:00:00Z'));
    console.log(`Products created before 2026-09-21: ${pre6BProducts.length}`);
    console.log(`Products created on/after 2026-09-21: ${post6BProducts.length}`);
    console.log(`Sum: ${pre6BProducts.length + post6BProducts.length}`);
  }

  // Check Telemart prices created before vs after 2026-09-21
  const telemartId = stores?.find(s => s.slug === 'telemart')?.id;
  const { data: tmPrices } = await supabase
    .from('prices')
    .select('id, variant_id, created_at')
    .eq('store_id', telemartId)
    .order('created_at', { ascending: true });

  if (tmPrices) {
    const pre6BTm = tmPrices.filter(pr => new Date(pr.created_at) < new Date('2026-09-21T00:00:00Z'));
    const post6BTm = tmPrices.filter(pr => new Date(pr.created_at) >= new Date('2026-09-21T00:00:00Z'));
    console.log(`\nTelemart prices before 2026-09-21: ${pre6BTm.length}`);
    console.log(`Telemart prices on/after 2026-09-21: ${post6BTm.length}`);
    console.log(`Total Telemart prices: ${tmPrices.length}`);
  }
}

main().catch(console.error);
