import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Testing token wildcard query for "HP Laptop":');
  const { data: res1 } = await supabase
    .from('products')
    .select('id, name')
    .or('name.ilike."%HP Laptop%",normalized_name.ilike."%HP Laptop%"')
    .limit(20);
  console.log(`Literal "%HP Laptop%" matched: ${res1?.length} products`);

  const { data: res2 } = await supabase
    .from('products')
    .select('id, name')
    .or('name.ilike."%HP%Laptop%",normalized_name.ilike."%HP%Laptop%"')
    .limit(20);
  console.log(`Token wildcard "%HP%Laptop%" matched: ${res2?.length} products`);
  res2?.forEach(p => console.log('  -', p.name));

  console.log('\nTesting token wildcard query for "Samsung Watch":');
  const { data: res3 } = await supabase
    .from('products')
    .select('id, name')
    .or('name.ilike."%Samsung Watch%",normalized_name.ilike."%Samsung Watch%"')
    .limit(20);
  console.log(`Literal "%Samsung Watch%" matched: ${res3?.length} products`);

  const { data: res4 } = await supabase
    .from('products')
    .select('id, name')
    .or('name.ilike."%Samsung%Watch%",normalized_name.ilike."%Samsung%Watch%"')
    .limit(20);
  console.log(`Token wildcard "%Samsung%Watch%" matched: ${res4?.length} products`);
  res4?.forEach(p => console.log('  -', p.name));
}

main().catch(console.error);
