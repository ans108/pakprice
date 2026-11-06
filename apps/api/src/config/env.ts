import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((v) => parseInt(v, 10)),

  // Supabase — all optional at startup; the app starts but DB endpoints
  // return a 503 if these are not configured.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((v) => parseInt(v, 10)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform((v) => parseInt(v, 10)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.errors.forEach((err) => {
    console.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

/** Whether Supabase is fully configured for server-side operations */
export const isSupabaseConfigured =
  Boolean(env.SUPABASE_URL) &&
  Boolean(env.SUPABASE_ANON_KEY) &&
  Boolean(env.SUPABASE_SERVICE_ROLE_KEY) &&
  !env.SUPABASE_URL?.includes('your-project-ref') &&
  env.SUPABASE_ANON_KEY !== 'your-supabase-anon-key' &&
  env.SUPABASE_SERVICE_ROLE_KEY !== 'your-supabase-service-role-key';
