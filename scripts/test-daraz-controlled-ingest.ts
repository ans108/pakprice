import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { DarazScraper } from '../apps/scraper/src/scrapers/stores/DarazScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log('=============================================================');
  console.log('  DARAZ CONTROLLED REAL PRODUCT INGESTION PIPELINE');
  console.log('=============================================================\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'daraz').single();
  if (!store) throw new Error('Daraz store not found');

  const darazScraper = new DarazScraper();
  const ingestionService = new PriceIngestionService();

  // 1. Discovery
  const discoveryUrl = 'https://www.daraz.pk/smartphones/';
  console.log(`1. Discovery: Fetching ${discoveryUrl}`);
  const catRes = await fetch(discoveryUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  console.log(`   Category HTTP Status: ${catRes.status}`);
  const catHtml = await catRes.text();
  const productLinks: string[] = [];
  const linkMatches = catHtml.match(/https:\/\/www\.daraz\.pk\/products\/[a-zA-Z0-9\-_.]+/g) || [];
  for (const l of linkMatches) {
    const clean = l.split('?')[0];
    if (clean.includes('.html') && !productLinks.includes(clean)) productLinks.push(clean);
  }
  console.log(`   Discovered ${productLinks.length} product links. Candidate: ${productLinks[0] || 'none'}`);

  const productUrl = productLinks[0] || 'https://www.daraz.pk/products/2-3-32-3000-i1968648084.html';

  // 2. Fetch product page
  console.log(`\n2. Product Page Fetch: ${productUrl}`);
  const prodRes = await fetch(productUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  console.log(`   Product HTTP Status: ${prodRes.status}`);
  const prodHtml = await prodRes.text();

  // 3. Extraction
  console.log('\n3. Extraction via DarazScraper (HTML / JSON-LD / __moduleData__)');
  const extracted = darazScraper.extractFromHtml(prodHtml, productUrl);
  if (!extracted) {
    console.error('   ❌ Extraction failed or returned null');
    process.exit(1);
  }
  console.log(`   Name: ${extracted.name}`);
  console.log(`   Price: PKR ${extracted.price}`);
  console.log(`   Original Price: PKR ${extracted.originalPrice}`);
  console.log(`   Identifier: ${extracted.sourceIdentifier} (${extracted.sourceIdentifierType})`);
  console.log(`   Image URL: ${extracted.imageUrl}`);
  console.log(`   RAM: ${extracted.ramGb}GB | Storage: ${extracted.storageGb}GB`);

  // 4. Validation
  console.log('\n4. Validation via validateProduct contract');
  const valid = darazScraper.validateProduct(extracted);
  if (!valid) {
    console.error('   ❌ Product failed schema validation');
    process.exit(1);
  }
  console.log('   ✅ Validated successfully against ScrapedProductSchema');

  // 5. Ingestion & Matcher & Persistence
  console.log('\n5. Ingestion through PriceIngestionService');
  const result = await ingestionService.ingest(valid, store.id, false);
  console.log(`   Ingestion Action: ${result.action}`);
  console.log(`   Variant ID: ${result.variantId}`);
  console.log(`   Product ID: ${result.productId}`);
  console.log(`   Match Method: ${result.matchMethod || 'new_product'}`);

  console.log('\n=============================================================');
  console.log(`Daraz Pipeline Status: ${result.action === 'created' || result.action === 'updated' ? 'PASSED ✅' : 'REJECTED'}`);
  console.log('=============================================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
