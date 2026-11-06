import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkStore() {
  const { data: stores, error } = await supabase.from('stores').select('*');
  if (error) throw error;
  console.log('Stores in database:');
  for (const s of stores || []) {
    console.log(`- ${s.name} (${s.slug}) | Active: ${s.is_active} | ID: ${s.id}`);
  }

  const shophive = stores?.find(s => s.slug === 'shophive');
  if (!shophive) {
    console.log('\n"shophive" store is NOT in the database yet. It needs to be inserted.');
  } else {
    console.log('\n"shophive" store EXISTS with ID:', shophive.id);
  }
}

checkStore().catch(console.error);
