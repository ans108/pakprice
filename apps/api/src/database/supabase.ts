import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../config/env';
import logger from '../utils/logger';

let _supabase: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  // Service-role client for server-side operations — bypasses RLS.
  // This client must NEVER be exposed to the browser or frontend.
  _supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  logger.info('Supabase client initialised (service-role).');
} else {
  logger.warn(
    'Supabase environment variables are not configured. ' +
      'Database endpoints will return 503 until SUPABASE_URL, ' +
      'SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in .env'
  );
}

export const supabase = _supabase;
export { isSupabaseConfigured };
