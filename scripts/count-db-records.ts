import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: variantCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: priceCount } = await supabase.from('prices').select('*', { count: 'exact', head: true });

  console.log(JSON.stringify({ productCount, variantCount, priceCount }));
}

main().catch(console.error);
