import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { ProductMatcher } from '../apps/scraper/src/services/ProductMatcher';
import { 
  normalizeProductName, 
  calculateStringSimilarity, 
  isConflictingProductFamily 
} from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function auditFuzzyMatches() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  RE-AUDITING 3 ACCEPTED 6G FUZZY MATCHES VIA UNMODIFIED MATCHER');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const { data: shophiveStore } = await db.from('stores').select('*').eq('slug', 'shophive').single();
  if (!shophiveStore) throw new Error('Shophive store not found');

  const scraper = new ShophiveScraper();
  const matcher = new ProductMatcher();

  const targets = [
    {
      name: 'Infinix Smart 20',
      url: 'https://www.shophive.com/infinix-smart-20-4gb-64gb/',
      category: 'mobiles',
      variantId: 'd15be40f-3433-44e0-8f34-7639f4fbd979',
    },
    {
      name: 'Mibro C3 Bluetooth Calling Smart Watch',
      url: 'https://www.shophive.com/mibro-c3-dual-strap-calling-smart-watch/',
      category: 'smart-watches',
      variantId: 'c7ba7cd3-3d45-40c6-8562-08ad73e1ca04',
    },
    {
      name: 'Samsung Galaxy Fit 3 Smart Band',
      url: 'https://www.shophive.com/samsung-galaxy-band-fit-3-smart-watch/',
      category: 'smart-watches',
      variantId: 'f4c2cb73-3c77-43f1-8f02-bcd8a44c9f1d',
    },
  ];

  for (const t of targets) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`TARGET: ${t.name}`);
    console.log(`URL: ${t.url}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Fetch live HTML from target URL
    const res = await axios.get(t.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    const extracted = scraper.extractProductFromHtml(res.data, t.url, t.category);
    if (!extracted) {
      console.error(`Failed to extract product from ${t.url}`);
      continue;
    }
    const validated = scraper.validateProduct(extracted);
    if (!validated) {
      console.error(`Failed to validate product from ${t.url}`);
      continue;
    }

    console.log(`Extracted Source Product:`, {
      name: validated.name,
      brand: validated.brand,
      modelNumber: validated.modelNumber,
      ramGb: validated.ramGb,
      storageGb: validated.storageGb,
      color: validated.color,
      sku: validated.sku,
      gtin: validated.gtin,
      sourceIdentifier: validated.sourceIdentifier,
      sourceIdentifierType: validated.sourceIdentifierType,
    });

    // Run ProductMatcher in two modes:
    // A: Fresh matching simulation (before Shophive store identifier existed in DB)
    const freshMatchResult = await matcher.match(
      { ...validated, sourceIdentifier: undefined }, 
      '00000000-0000-0000-0000-000000000000'
    );

    // B: Current live matching (with Shophive store identifier)
    const liveMatchResult = await matcher.match(validated, shophiveStore.id);

    console.log(`\nProductMatcher Fresh Evaluation (Initial Ingestion Match):`, {
      status: freshMatchResult.status,
      method: freshMatchResult.method,
      confidence: freshMatchResult.confidence,
      reason: freshMatchResult.reason,
      matchedProductId: freshMatchResult.product?.id,
      matchedProductName: freshMatchResult.product?.name,
      matchedVariantId: freshMatchResult.variant?.id,
      matchedVariantName: freshMatchResult.variant?.name,
    });

    console.log(`\nProductMatcher Live Evaluation (Idempotent Subsequent Scrapes):`, {
      status: liveMatchResult.status,
      method: liveMatchResult.method,
      confidence: liveMatchResult.confidence,
      reason: liveMatchResult.reason,
    });

    // Detailed breakdown of Canonical vs Source
    const canonicalProduct = freshMatchResult.product || liveMatchResult.product;
    const canonicalVariant = freshMatchResult.variant || liveMatchResult.variant;
    const matchResult = freshMatchResult;

    const sourceNorm = normalizeProductName(validated.name);
    const canonicalNorm = canonicalProduct ? normalizeProductName(canonicalProduct.name) : null;
    const similarity = canonicalNorm ? calculateStringSimilarity(sourceNorm, canonicalNorm) : 0;
    const isConflict = canonicalNorm ? isConflictingProductFamily(sourceNorm, canonicalNorm) : false;

    console.log(`\nDetailed Audit Fields:`);
    console.log(`- status: ${matchResult.status}`);
    console.log(`- strategy / tier: Tier ${matchResult.method === 'store_identifier' ? '2 (store_identifier)' : matchResult.method === 'exact_specs' ? '4 (exact_specs)' : matchResult.method === 'strong_specs' ? '5 (strong_specs)' : matchResult.method === 'fuzzy' ? '6 (fuzzy)' : matchResult.method}`);
    console.log(`- confidence: ${matchResult.confidence}`);
    console.log(`- reason: ${matchResult.reason}`);
    console.log(`- canonical product name: ${canonicalProduct?.name}`);
    console.log(`- source product name: ${validated.name}`);
    console.log(`- brand: ${validated.brand}`);
    console.log(`- model number: ${validated.modelNumber || 'none'}`);
    console.log(`- RAM: ${validated.ramGb ? validated.ramGb + 'GB' : 'null'}`);
    console.log(`- storage: ${validated.storageGb ? validated.storageGb + 'GB' : 'null'}`);
    console.log(`- color: ${validated.color || 'null'}`);
    console.log(`- SKU: ${validated.sku || 'none'}`);
    console.log(`- GTIN: ${validated.gtin || 'none'}`);
    console.log(`- source identifier: ${validated.sourceIdentifier} (${validated.sourceIdentifierType})`);
    console.log(`- normalized source name: "${sourceNorm}"`);
    console.log(`- normalized canonical name: "${canonicalNorm}"`);
    console.log(`- string similarity score: ${similarity.toFixed(4)}`);
    console.log(`- explicit family conflict check (isConflictingProductFamily): ${isConflict ? 'CONFLICT (rejected)' : 'CLEAN (passed)'}`);

    if (matchResult.candidates && matchResult.candidates.length > 0) {
      console.log(`- candidates considered (${matchResult.candidates.length}):`);
      for (const c of matchResult.candidates) {
        console.log(`    * [${c.method}] ${c.productName} (confidence: ${c.confidence})`);
      }
    }
  }
}

auditFuzzyMatches().catch(console.error);
