import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function clean() {
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.slug, s.id]));

  const priceoyeId = storeMap.get('priceoye');
  const shophiveId = storeMap.get('shophive');

  // 1. Delete OnePlus Watch 2R erroneous priceoye offer
  const var1 = '3355dbc6-fa08-4a92-acee-5cd2ba4d6383';
  await supabase.from('prices').delete().eq('variant_id', var1).eq('store_id', priceoyeId);
  await supabase.from('price_history').delete().eq('variant_id', var1).eq('store_id', priceoyeId);
  await supabase.from('store_product_identifiers').delete().eq('variant_id', var1).eq('store_id', priceoyeId);
  console.log('✓ Cleaned OnePlus Watch 2R priceoye error');

  // 2. Delete Amazfit GTR 3 Pro erroneous shophive offer
  const var2 = 'd52adda1-32f3-4a31-85cb-c5ca1eb80950';
  await supabase.from('prices').delete().eq('variant_id', var2).eq('store_id', shophiveId);
  await supabase.from('price_history').delete().eq('variant_id', var2).eq('store_id', shophiveId);
  await supabase.from('store_product_identifiers').delete().eq('variant_id', var2).eq('store_id', shophiveId);
  console.log('✓ Cleaned Amazfit GTR 3 Pro shophive error');
}

clean().catch(console.error);

