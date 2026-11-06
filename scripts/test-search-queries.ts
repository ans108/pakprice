import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ProductRepository } from '../apps/api/src/repositories/productRepository.js';
import { ProductService } from '../apps/api/src/services/productService.js';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function testSearch() {
  const service = new ProductService(db);

  const testQueries = [
    'iPhone 17 Pro Max',
    'Samsung Galaxy Watch 8',
    'Xiaomi Smart Band 10',
    'HP laptop',
    'Redmi Note 14',
    'Infinix',
    'Zero Luna'
  ];

  console.log('=== TESTING CURRENT SEARCH IMPLEMENTATION ===\n');

  for (const q of testQueries) {
    const res = await service.listProducts({
      q,
      sort: 'relevance',
      pagination: { page: 1, limit: 10, offset: 0 }
    });
    console.log(`Query: "${q}" -> Total: ${res.pagination.total} results`);
    for (const p of res.data.slice(0, 3)) {
      console.log(`  - [${p.name}] (slug: ${p.slug}) | From: Rs. ${p.lowest_price} | Stores: ${p.store_count}`);
    }
    console.log('');
  }
}

testSearch().catch(console.error);
