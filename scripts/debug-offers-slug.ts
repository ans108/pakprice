import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

import { ProductService } from '../apps/api/src/services/productService';
import { ProductRepository } from '../apps/api/src/repositories/productRepository';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const service = new ProductService(supabase);

  const res = await service.getMultiStoreOffers('infinix-infinix-xe30-wireless-earbuds');
  console.log('Result from service.getMultiStoreOffers:');
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
