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
  const { data: brands } = await supabase.from('brands').select('id, name, slug').order('name');
  console.log(`Found ${brands?.length} brands in DB:`);
  console.log(brands?.map(b => `${b.name} (${b.slug})`).join(', '));
}

run().catch(console.error);

