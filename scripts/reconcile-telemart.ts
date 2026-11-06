import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const telemartId = stores?.find(s => s.slug === 'telemart')?.id;
  const priceoyeId = stores?.find(s => s.slug === 'priceoye')?.id;

  // Fetch all Telemart prices
  const { data: tmPrices } = await supabase
    .from('prices')
    .select('id, variant_id, created_at, updated_at')
    .eq('store_id', telemartId)
    .order('created_at', { ascending: true });

  const pre6B = (tmPrices || []).filter(p => new Date(p.created_at) < new Date('2026-09-21T00:00:00Z'));
  const post6B = (tmPrices || []).filter(p => new Date(p.created_at) >= new Date('2026-09-21T00:00:00Z'));

  console.log(`Telemart prices before 6B: ${pre6B.length}`);
  console.log(`Telemart prices in 6B:     ${post6B.length}`);
  console.log(`Telemart prices total:     ${tmPrices?.length}`);

  // Fetch variants for pre6B
  const pre6BVarIds = pre6B.map(p => p.variant_id);
  const { data: preVars } = await supabase.from('product_variants').select('id, product_id, created_at').in('id', pre6BVarIds);
  console.log(`Pre-6B Telemart variants: ${preVars?.length}`);

  // Fetch all variants
  const { data: allVars } = await supabase.from('product_variants').select('id, product_id, created_at');
  const varMap = new Map<string, any>();
  for (const v of allVars || []) varMap.set(v.id, v);

  // Check how many post6B prices updated existing pre-6B variants vs created new variants
  let attachedToPre6BVariant = 0;
  let attachedToNewVariant = 0;

  for (const p of post6B) {
    const v = varMap.get(p.variant_id);
    if (v && new Date(v.created_at) < new Date('2026-09-21T00:00:00Z')) {
      attachedToPre6BVariant++;
    } else {
      attachedToNewVariant++;
    }
  }

  console.log(`Post-6B prices attached to pre-6B variants (matched existing): ${attachedToPre6BVariant}`);
  console.log(`Post-6B prices attached to newly created variants:              ${attachedToNewVariant}`);

  // Check if any pre-6B Telemart prices were updated
  const updatedPre6B = pre6B.filter(p => new Date(p.updated_at) >= new Date('2026-09-21T00:00:00Z'));
  console.log(`Pre-6B Telemart prices updated during 6B: ${updatedPre6B.length}`);

  // Check multi-store matches for Telemart
  const { data: poPrices } = await supabase.from('prices').select('variant_id').eq('store_id', priceoyeId);
  const poVarSet = new Set(poPrices?.map(p => p.variant_id));

  let tmPreMatches = 0;
  for (const p of pre6B) {
    if (poVarSet.has(p.variant_id)) tmPreMatches++;
  }
  let tmPostMatches = 0;
  for (const p of post6B) {
    if (poVarSet.has(p.variant_id)) tmPostMatches++;
  }
  console.log(`Multi-store matches in pre-6B Telemart prices:  ${tmPreMatches}`);
  console.log(`Multi-store matches in post-6B Telemart prices: ${tmPostMatches}`);
  console.log(`Total multi-store matches:                      ${tmPreMatches + tmPostMatches}`);
}

main().catch(console.error);
