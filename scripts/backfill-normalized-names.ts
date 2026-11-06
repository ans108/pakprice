import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeProductName } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function backfillNormalizedNames() {
  console.log('=== Backfilling products.normalized_name with stripRetailNoise ===\n');

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, normalized_name');

  if (error || !products) {
    console.error('Failed to load products:', error);
    process.exit(1);
  }

  console.log(`Loaded ${products.length} products from database.`);
  let updatedCount = 0;

  for (const product of products) {
    const cleanNormalized = normalizeProductName(product.name);
    if (product.normalized_name !== cleanNormalized) {
      const { error: updateErr } = await supabase
        .from('products')
        .update({ normalized_name: cleanNormalized })
        .eq('id', product.id);

      if (updateErr) {
        console.error(`Failed to update ${product.id}:`, updateErr);
      } else {
        updatedCount++;
        if (updatedCount <= 10 || updatedCount % 50 === 0) {
          console.log(`[${updatedCount}] "${product.name}" -> "${cleanNormalized}"`);
        }
      }
    }
  }

  console.log(`\nBackfill complete! Updated ${updatedCount} products out of ${products.length}.`);
}

backfillNormalizedNames().catch(console.error);
