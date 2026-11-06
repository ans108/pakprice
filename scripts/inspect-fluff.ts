import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function inspectTitles() {
  const { data: prods } = await supabase.from('products').select('id, name, normalized_name');
  
  const fluffPatterns = [
    /dual\s+sim/i,
    /with\s+official\s+warranty/i,
    /official\s+warranty/i,
    /pta\s+approved/i,
    /non\s+pta/i,
    /1\s+year\s+warranty/i,
    /with\s+warranty/i,
  ];

  const matchedCounts: Record<string, number> = {};
  const examples: Record<string, string[]> = {};

  for (const p of prods || []) {
    for (const pat of fluffPatterns) {
      if (pat.test(p.name)) {
        const k = pat.toString();
        matchedCounts[k] = (matchedCounts[k] || 0) + 1;
        examples[k] = examples[k] || [];
        if (examples[k].length < 3) examples[k].push(p.name);
      }
    }
  }

  console.log('Marketing fluff patterns in products table:');
  for (const [k, count] of Object.entries(matchedCounts)) {
    console.log(`Pattern ${k}: ${count} products`);
    console.log(`  Examples:`, examples[k]);
  }
}

inspectTitles().catch(console.error);
