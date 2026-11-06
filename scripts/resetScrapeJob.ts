import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function reset() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await supabase.from('scrape_jobs').update({ status: 'failed', error_message: 'Server restarted' }).eq('status', 'in_progress');
  console.log('Reset complete');
}

reset();
