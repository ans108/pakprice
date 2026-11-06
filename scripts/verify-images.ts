/**
 * Standalone live image verification script.
 * Increment 5D — Product Image Reliability & Rendering Hardening (Phase H)
 *
 * Samples 20 production product images and issues a lightweight HEAD request
 * to verify HTTP 200 response and image/* content-type.
 *
 * Run with:
 *   npx tsx scripts/verify-images.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/scraper/.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface VerificationResult {
  url: string;
  status: number | null;
  contentType: string | null;
  ok: boolean;
  error?: string;
}

async function checkImageUrl(url: string): Promise<VerificationResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    const isImage = contentType.toLowerCase().startsWith('image/');
    const ok = res.status === 200 && isImage;

    return {
      url,
      status: res.status,
      contentType,
      ok,
    };
  } catch (err: any) {
    return {
      url,
      status: null,
      contentType: null,
      ok: false,
      error: err?.message || String(err),
    };
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Increment 5D — Live Image Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Fetching sample of 20 product image URLs from database...');

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image_url')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Failed to query products:', error);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.warn('No products with image_url found.');
    process.exit(0);
  }

  console.log(`Found ${products.length} products. Checking URLs via HEAD requests...\n`);

  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    const result = await checkImageUrl(item.image_url!);

    if (result.ok) {
      okCount++;
      console.log(`[${i + 1}/20] ✅ HTTP ${result.status} (${result.contentType}) — ${item.name.slice(0, 40)}`);
    } else {
      failCount++;
      console.error(
        `[${i + 1}/20] ❌ FAIL: HTTP ${result.status ?? 'ERR'} (${result.contentType ?? 'none'}) — ${result.error ?? ''} — ${item.image_url}`
      );
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Verification Complete: ${okCount} OK, ${failCount} FAILED out of ${products.length} sampled`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
