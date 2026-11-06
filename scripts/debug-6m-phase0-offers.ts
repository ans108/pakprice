import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: prods } = await supabase
    .from('products')
    .select('id, name, slug, normalized_name')
    .ilike('name', '%a07%')
    .limit(10);

  console.log('Products matching a07:', prods);

  const { data: vivo } = await supabase
    .from('products')
    .select('id, name, slug, normalized_name')
    .ilike('name', '%vivo y05%')
    .limit(10);

  console.log('Products matching vivo y05:', vivo);
}

main().catch(console.error);
