import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeProductName, calculateStringSimilarity } from '@pakprice/shared';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function findTelemartMegaOverlap() {
  console.log('=== FINDING TELEMART & PRICEOYE OVERLAP WITH MEGA.PK ===\n');

  // Load all mega links we discovered
  const megaLinks: { cat: string; url: string; title?: string }[] = JSON.parse(
    fs.readFileSync('scratch/all-mega-links.json', 'utf8')
  );
  if (fs.existsSync('scratch/mega-laptops-harvested.json')) {
    const laptopLinks = JSON.parse(fs.readFileSync('scratch/mega-laptops-harvested.json', 'utf8'));
    megaLinks.push(...laptopLinks);
  }

  // Deduplicate mega links
  const uniqueMega = new Map<string, string>();
  for (const m of megaLinks) {
    const slug = m.url.split('/').pop()?.replace('.html', '').replace(/^\d+-/, '') || '';
    const cleanTitle = slug.replace(/[-_]/g, ' ');
    uniqueMega.set(m.url, cleanTitle);
  }

  console.log(`Unique Mega.pk product links loaded: ${uniqueMega.size}`);

  // Load DB products
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: dbProducts } = await supabase.from('products').select(`
    id, name, normalized_name,
    categories ( slug ),
    product_variants (
      id, name, model_number, ram_gb, storage_gb,
      prices ( store_id, price, stores(slug) )
    )
  `);

  const candidates: any[] = [];

  for (const [url, megaTitle] of uniqueMega.entries()) {
    const megaNorm = normalizeProductName(megaTitle);

    for (const p of dbProducts || []) {
      for (const v of p.product_variants || []) {
        if (!v.prices || v.prices.length === 0) continue;
        const storesHaving = v.prices.map((pr: any) => pr.stores?.slug).filter(Boolean);
        
        // Skip if already in mega-pk
        if (storesHaving.includes('mega-pk')) continue;

        const pNorm = p.normalized_name || normalizeProductName(p.name);
        const sim = calculateStringSimilarity(megaNorm, pNorm);

        // Check for protected Pro vs Pro Max conflict
        const mLower = megaNorm.toLowerCase();
        const pLower = pNorm.toLowerCase();
        if (
          (mLower.includes('pro max') && !pLower.includes('pro max') && pLower.includes('pro')) ||
          (!mLower.includes('pro max') && mLower.includes('pro') && pLower.includes('pro max'))
        ) {
          continue;
        }

        if (sim >= 0.85) {
          candidates.push({
            url,
            megaTitle,
            megaNorm,
            productId: p.id,
            productName: p.name,
            variantId: v.id,
            stores: storesHaving,
            similarity: sim,
          });
        }
      }
    }
  }

  // Deduplicate candidates
  const bestPerUrl = new Map<string, any>();
  for (const c of candidates) {
    const ex = bestPerUrl.get(c.url);
    if (!ex || c.similarity > ex.similarity) {
      bestPerUrl.set(c.url, c);
    }
  }

  const sorted = Array.from(bestPerUrl.values()).sort((a, b) => b.similarity - a.similarity);

  console.log(`Found ${sorted.length} candidate overlaps with existing priced variants:\n`);
  for (const c of sorted.slice(0, 20)) {
    console.log(`- Sim: ${c.similarity.toFixed(3)}`);
    console.log(`  Mega:     "${c.megaTitle}" (${c.url})`);
    console.log(`  Existing: "${c.productName}" (Stores: ${c.stores.join(', ')})`);
    console.log(`  Variant:  ${c.variantId}\n`);
  }

  fs.writeFileSync('scratch/top-mega-candidates.json', JSON.stringify(sorted, null, 2), 'utf8');
}

findTelemartMegaOverlap().catch(console.error);
