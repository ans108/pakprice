/**
 * Increment 6S — Validate Firecrawl Discovered Candidates
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { FirecrawlValidator, FirecrawlCandidateJson } from './firecrawl-validator';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  VALIDATING FIRECRAWL DISCOVERED CANDIDATES');
  console.log('════════════════════════════════════════════════════════════════');

  const validator = new FirecrawlValidator();
  await validator.init();

  const candidatesToValidate = [
    {
      productId: 'e679b01b-1299-411f-aaf3-65aeee6d748e',
      canonicalSlug: 'infinix-infinix-xe30-wireless-earbuds',
      candidate: {
        store_name: 'PriceOye',
        store_slug: 'priceoye',
        source_product_title: 'Infinix True Wireless Bluetooth Earbuds (XE30)',
        source_product_url: 'https://priceoye.pk/wireless-earbuds/infinix/infinix-true-wireless-bluetooth-earbuds-xe30',
        brand: 'Infinix',
        model: 'XE30',
        model_number: null,
        category: 'Wireless Earbuds',
        ram: null,
        storage: null,
        physical_size: null,
        color: 'Black',
        price: 3149,
        original_price: 6999,
        currency: 'PKR',
        stock_status: 'in_stock' as const,
        sku: null,
        image_url: 'https://images.priceoye.pk/infinix-true-wireless-bluetooth-earbuds-xe30-pakistan-priceoye-xwtug-500x500.webp',
        description: 'Infinix True Wireless Bluetooth Earbuds (XE30)',
        discovery_method: 'firecrawl_search',
        extraction_timestamp: new Date().toISOString(),
      },
    },
    {
      productId: '5b0ee0f0-449f-4460-af82-d0927fe3ea1e',
      canonicalSlug: 'lenovo-lenovo-lp80-pro-gaming-earbuds',
      candidate: {
        store_name: 'PriceOye',
        store_slug: 'priceoye',
        source_product_title: 'Lenovo LP80 Pro Wireless Earbuds',
        source_product_url: 'https://priceoye.pk/wireless-earbuds/lenovo/lenovo-lp80-pro-wireless-earbuds',
        brand: 'Lenovo',
        model: 'LP80 Pro',
        model_number: null,
        category: 'wireless earbuds',
        ram: null,
        storage: null,
        physical_size: null,
        color: 'Black, White',
        price: 3249,
        original_price: 4000,
        currency: 'PKR',
        stock_status: 'in_stock' as const,
        sku: null,
        image_url: 'https://images.priceoye.pk/lenovo-lp80-pro-wireless-earbuds-pakistan-priceoye-ijktm-500x500.webp',
        description: 'Lenovo LP80 Pro Wireless Earbuds',
        discovery_method: 'firecrawl_search',
        extraction_timestamp: new Date().toISOString(),
      },
    },
    {
      productId: '6f26d813-40ec-46a7-ae22-fc25c31d08f7',
      canonicalSlug: 'unknown-dany-titan-t-100-power-bank-20000-mah',
      candidate: {
        store_name: 'Telemart',
        store_slug: 'telemart',
        source_product_title: 'Dany Titan T-100 20000mAh PD 22.5W Fast Charging Power Bank',
        source_product_url: 'https://www.telemart.pk/products/dany-titan-t-100-20000mah-pd-22-5w-fast-charging-power-bank',
        brand: 'Dany',
        model: 'Titan T-100',
        model_number: null,
        category: 'Power Bank',
        ram: null,
        storage: null,
        physical_size: null,
        color: 'Black',
        price: 4899,
        original_price: 6200,
        currency: 'PKR',
        stock_status: 'in_stock' as const,
        sku: null,
        image_url: 'https://www.telex.pk/cdn/shop/files/audionic-the-sound-master-default-title-dany-titan-t-100-black-20000-mah-power-bank-35403744018588_copy_684x752.webp?v=1785056927',
        description: null,
        discovery_method: 'firecrawl_search',
        extraction_timestamp: new Date().toISOString(),
      },
    },
  ];

  const results: any[] = [];
  let allValid = true;

  for (const item of candidatesToValidate) {
    console.log(`\nTesting Candidate for: ${item.canonicalSlug}`);

    // Fetch canonical product from DB
    const { data: prod, error } = await supabase
      .from('products')
      .select(`
        id, name, slug, brand_id, category_id,
        product_variants ( id, name, ram_gb, storage_gb, color, model_number )
      `)
      .eq('id', item.productId)
      .single();

    if (error || !prod) {
      console.error(`  ❌ Canonical product query error:`, error);
      allValid = false;
      continue;
    }

    const valResult = await validator.validateCandidate(prod, item.candidate);
    console.log(`  Status    : ${valResult.status === 'approved' ? '✅ APPROVED' : '❌ ' + valResult.status}`);
    console.log(`  Strategy  : ${valResult.strategy || 'N/A'}`);
    console.log(`  Confidence: ${valResult.confidence ?? 'N/A'}`);
    console.log(`  Variant ID: ${valResult.matchedVariantId}`);
    console.log(`  Reason    : ${valResult.reason}`);

    if (valResult.status !== 'approved') allValid = false;
    results.push({ item, valResult });
  }

  const outPath = path.resolve(process.cwd(), 'scripts/firecrawl_validation_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  FIRECRAWL CANDIDATE VALIDATION: ${allValid ? '🎉 ALL CANDIDATES APPROVED' : '❌ SOME REJECTED'}`);
  console.log(`  Results saved to: ${path.basename(outPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
