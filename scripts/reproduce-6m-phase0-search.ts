import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const queries = [
  'iphone',
  'samsung',
  'vivo',
  'oppo',
  'xiaomi',
  'galaxy watch',
  'laptop',
  'smartwatch'
];

async function main() {
  console.log('========================================================================');
  console.log('PHASE 0 SEARCH REPRODUCTION & PERFORMANCE AUDIT');
  console.log('========================================================================\n');

  for (const q of queries) {
    console.log(`------------------------------------------------------------------------`);
    console.log(`QUERY: "${q}"`);
    console.log(`------------------------------------------------------------------------`);

    // 1. Direct Backend API Measure
    const t0Api = performance.now();
    let apiData: any = null;
    let apiStatus = 0;
    try {
      const res = await axios.get(`http://localhost:4000/api/v1/search`, {
        params: { q },
        timeout: 15000,
      });
      apiStatus = res.status;
      apiData = res.data;
    } catch (err: any) {
      console.error(`  [API Error]:`, err.message);
    }
    const apiDuration = Math.round(performance.now() - t0Api);

    // 2. Direct Frontend Web Route Measure
    const t0Web = performance.now();
    let webStatus = 0;
    let webHtml = '';
    try {
      const res = await axios.get(`http://localhost:3000/search`, {
        params: { q },
        timeout: 15000,
      });
      webStatus = res.status;
      webHtml = res.data;
    } catch (err: any) {
      console.error(`  [Web Error]:`, err.message);
    }
    const webDuration = Math.round(performance.now() - t0Web);

    // 3. Database Raw Candidates Inspection (matching what ProductRepository does)
    const sanitized = q.trim().replace(/\s+/g, ' ').slice(0, 200);
    const escapedSql = sanitized.replace(/[%_]/g, '\\$&');
    const escapedPostgrest = escapedSql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const orCondition = `name.ilike."%${escapedPostgrest}%",normalized_name.ilike."%${escapedPostgrest}%"`;
    const { count: rawDbCount, error: countErr } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(orCondition);

    // Also check token-split candidates to see if there are additional matching products in catalog
    const tokens = sanitized.split(' ').filter(Boolean);
    let tokenSplitCount = rawDbCount ?? 0;
    if (tokens.length > 1) {
      const tokenWildcard = tokens.map((t) => t.replace(/[%_]/g, '\\$&')).join('%');
      const escapedToken = tokenWildcard.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const { count: tCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`name.ilike."%${escapedToken}%",normalized_name.ilike."%${escapedToken}%"`);
      tokenSplitCount = tCount ?? 0;
    }

    const apiTotal = apiData?.pagination?.total ?? 0;
    const apiReturned = apiData?.data?.length ?? 0;
    const pageSize = apiData?.pagination?.limit ?? 20;

    console.log(`  - API Result Count (total):         ${apiTotal}`);
    console.log(`  - API Page Size:                    ${pageSize}`);
    console.log(`  - API Returned Items (Page 1):      ${apiReturned}`);
    console.log(`  - Database Raw Literal Matches:     ${rawDbCount ?? 0}`);
    console.log(`  - Database Token Wildcard Matches:  ${tokenSplitCount}`);
    console.log(`  - Backend API Request Duration:     ${apiDuration} ms`);
    console.log(`  - Frontend Page Load Duration:      ${webDuration} ms`);
    console.log(`  - Web HTTP Status:                  ${webStatus}`);
    if (apiData?.data?.length > 0) {
      console.log(`  - Sample Top 3 Results:`);
      apiData.data.slice(0, 3).forEach((p: any, i: number) => {
        console.log(`      ${i + 1}. [${p.slug}] ${p.name} (Rs. ${p.lowest_price})`);
      });
    }
    console.log('');
  }
}

main().catch(console.error);
