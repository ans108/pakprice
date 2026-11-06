import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper.js';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== FIXING TELEMART 40MM PROVENANCE ===\n');

  const { data: store } = await supabase.from('stores').select('id, slug').eq('slug', 'telemart').single();
  if (!store) throw new Error('Telemart store not found');

  const scraper = new TelemartScraper();
  const ingestionService = new PriceIngestionService();

  const url40mm = 'https://www.telemart.pk/collections/mens-watches/products/samsung-galaxy-watch-8-40mm';
  console.log(`Fetching 40mm PDP from Telemart: ${url40mm}`);

  const res = await axios.get(url40mm, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const product = scraper.extractFromHtml(res.data, url40mm);
  if (!product) throw new Error('Failed to extract Telemart 40mm product');

  // Ensure sourceIdentifier matches Shopify product ID if available from JSON
  const jsonRes = await axios.get(url40mm + '.json', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (jsonRes.data?.product?.id) {
    product.sourceIdentifier = String(jsonRes.data.product.id);
    product.sourceIdentifierType = 'product_id';
    product.sku = jsonRes.data.product.variants?.[0]?.sku || product.sku;
  }

  console.log('Telemart 40mm extracted product:', {
    name: product.name,
    price: product.price,
    sourceUrl: product.sourceUrl,
    sourceIdentifier: product.sourceIdentifier,
    sku: product.sku
  });

  // Check current DB prices before update
  const { data: priceBefore } = await supabase
    .from('prices')
    .select('*')
    .eq('variant_id', '3486efcf-79a1-408e-9e04-8d7792e72a64')
    .eq('store_id', store.id)
    .single();

  console.log('\nCurrent Telemart price row before correction:', priceBefore);

  // Ingest corrected Telemart 40mm product
  console.log('\nIngesting verified Telemart 40mm product...');
  const ingestRes = await ingestionService.ingest(product, store.id, false);
  console.log('Ingestion result:', ingestRes);

  // Check price row after update
  const { data: priceAfter } = await supabase
    .from('prices')
    .select('*')
    .eq('variant_id', '3486efcf-79a1-408e-9e04-8d7792e72a64')
    .eq('store_id', store.id)
    .single();

  console.log('\nCorrected Telemart price row after update:', priceAfter);

  // If there's an outdated 46mm identifier on this variant, let's clean it up
  const { data: idents } = await supabase
    .from('store_product_identifiers')
    .select('*')
    .eq('variant_id', '3486efcf-79a1-408e-9e04-8d7792e72a64')
    .eq('store_id', store.id);

  console.log('\nTelemart identifiers for variant:', idents);
  for (const id of idents || []) {
    if (id.identifier === '9440730251484' || id.identifier.includes('46mm')) {
      console.log(`Removing incorrect 46mm identifier: ${id.identifier}`);
      await supabase.from('store_product_identifiers').delete().eq('id', id.id);
    }
  }
}

main().catch(console.error);
