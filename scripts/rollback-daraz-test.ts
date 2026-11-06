import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function rollbackDarazTest() {
  console.log('=== SAFELY ROLLING BACK DARAZ TEST-INGEST ARTIFACTS ===\n');

  const testHistoryId = '49a51aec-7a2a-42b7-a639-17358054a7c8';
  const darazVariantId = '6e8c2c4b-5b28-4ee1-8e6d-60bcecc28886';
  const baselineTimestamp = '2026-09-22T00:23:52.443+00:00';

  // 1. Delete the test-created history row
  console.log(`Deleting test price_history row: ${testHistoryId}...`);
  const { data: delData, error: delErr } = await db
    .from('price_history')
    .delete()
    .eq('id', testHistoryId)
    .select();

  if (delErr) {
    console.error('Failed to delete history row:', delErr);
    process.exit(1);
  }
  console.log('Deleted price_history row successfully:', delData);

  // 2. Revert the prices row last_scraped_at to baseline
  console.log(`Reverting prices row for variant ${darazVariantId} to baseline timestamp ${baselineTimestamp}...`);
  const { data: updateData, error: updateErr } = await db
    .from('prices')
    .update({
      last_scraped_at: baselineTimestamp,
      updated_at: baselineTimestamp,
    })
    .eq('variant_id', darazVariantId)
    .select();

  if (updateErr) {
    console.error('Failed to revert prices row:', updateErr);
    process.exit(1);
  }
  console.log('Reverted prices row successfully:', updateData);

  console.log('\nRollback completed cleanly.');
}

rollbackDarazTest().catch(console.error);
