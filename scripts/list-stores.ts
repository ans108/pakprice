import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: stores, error } = await supabase.from('stores').select('id, name, slug').order('slug');
  if (error) {
    console.error('Error fetching stores:', error);
    return;
  }
  console.log(`Found ${stores.length} stores:`);
  
  const { data: prices } = await supabase.from('prices').select('store_id');
  const counts: Record<string, number> = {};
  prices?.forEach(p => counts[p.store_id] = (counts[p.store_id] || 0) + 1);

  for (const s of stores) {
    console.log(`- slug: "${s.slug}", name: "${s.name}", count: ${counts[s.id] || 0}`);
  }
  console.log(`Total active prices: ${prices?.length || 0}`);
}

run().catch(console.error);
