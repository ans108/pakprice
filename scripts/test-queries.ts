import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function buildCleanQueries(name: string, brandName?: string): string[] {
  let clean = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(Dual\s*Sim|With\s*Official\s*Warranty|Official\s*Warranty|Pin\s*Pack|PTA\s*Approved|Non\s*PTA|1\s*Year\s*Warranty|Global\s*Version|Box\s*Pack)\b/gi, ' ')
    .replace(/\b(Milanese\s*Loop|Sport\s*Band|Ocean\s*Band|Trail\s*Loop|Alpine\s*Loop|Silicone\s*Strap|Leather\s*Strap|Case\s*with|Case|Band|Strap|Midnight|Starlight|Space\s*Gray|Space\s*Grey|Jet\s*Black|Graphite|Silver|Rose\s*Gold|Titanium|Stainless\s*Steel|Aluminum)\b/gi, ' ')
    .replace(/\b(With\s*Active\s*Noise\s*Cancellation|Active\s*Noise\s*Cancellation|Noise\s*Cancelling|Semi-in-Ear|True\s*Wireless|Wireless|Bluetooth|Calling|Smartwatch|Smart\s*Watch|Earbuds|Headphones)\b/gi, ' ')
    .replace(/\b(Backlit\s*KB|Fingerprint\s*Reader|DOS|Win11|Windows\s*11|OLED|WQXGA|WUXGA|FHD|IPS|Display|Laptop)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (brandName) {
    const brandRegex = new RegExp(`^${brandName}\\s+${brandName}\\b`, 'i');
    clean = clean.replace(brandRegex, brandName);
    if (!clean.toLowerCase().startsWith(brandName.toLowerCase())) {
      clean = `${brandName} ${clean}`;
    }
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  const q1 = tokens.slice(0, 4).join(' ');
  const q2 = tokens.slice(0, 3).join(' ');

  const queries = [q1];
  if (q2 && q2 !== q1 && tokens.length > 3) queries.push(q2);
  return queries;
}

async function run() {
  const { data: prods } = await supabase.from('products').select('name, brand_id, brands(name)').limit(15);
  for (const p of prods || []) {
    console.log(`Original: "${p.name}"`);
    console.log(`Queries :`, buildCleanQueries(p.name, (p as any).brands?.name));
    console.log('---');
  }
}
run();

