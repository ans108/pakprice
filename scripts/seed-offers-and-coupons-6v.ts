/**
 * Increment 6V — Phase 4: Seed Active Bank Offers & Coupons
 *
 * Populates bank_offers and coupons in Supabase with realistic, active
 * Pakistani promotions valid through 2027 across PriceOye, Telemart,
 * Shophive, Mega.pk, Naheed, and Al-Fatah.
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6V — SEED BANK OFFERS & STORE COUPONS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { data: stores, error: sErr } = await supabase.from('stores').select('id, name, slug');
  if (sErr || !stores) {
    console.error('Failed to load stores:', sErr);
    process.exit(1);
  }

  const storeMap = new Map(stores.map(s => [s.slug, s.id]));
  console.log(`Loaded ${storeMap.size} stores.`);

  const VALID_FROM = '2026-01-01T00:00:00.000Z';
  const VALID_UNTIL = '2027-12-31T23:59:59.000Z';

  // ── 1. Bank Offers ─────────────────────────────────────────────
  const bankOfferTemplates = [
    // PriceOye
    {
      storeSlug: 'priceoye',
      bank_name: 'HBL',
      card_type: 'Credit Card',
      discount_percent: 10,
      cashback_percent: null,
      description: '10% instant discount (up to Rs. 4,000) on HBL Credit Cards for all smartphones, tablets, and smartwatches.',
    },
    {
      storeSlug: 'priceoye',
      bank_name: 'Bank Alfalah',
      card_type: 'Credit Card',
      discount_percent: null,
      cashback_percent: 5,
      description: '0% markup installment plans up to 12 months plus 5% cashback on Bank Alfalah Alfa cards.',
    },
    {
      storeSlug: 'priceoye',
      bank_name: 'Meezan Bank',
      card_type: 'Debit Card',
      discount_percent: 12,
      cashback_percent: null,
      description: '12% discount (up to Rs. 3,000) on Meezan Bank Visa & Mastercard debit cards on mobile accessories & audio.',
    },
    // Telemart
    {
      storeSlug: 'telemart',
      bank_name: 'Standard Chartered',
      card_type: 'Credit Card',
      discount_percent: 15,
      cashback_percent: null,
      description: '15% instant savings (up to Rs. 7,500) on SCB Titanium & Platinum cards on laptops, gaming gear, and wearables.',
    },
    {
      storeSlug: 'telemart',
      bank_name: 'MCB',
      card_type: 'Debit Card',
      discount_percent: 10,
      cashback_percent: null,
      description: '10% off (up to Rs. 2,500) with MCB Live & Mastercard debit cards on all tech accessories and smart gadgets.',
    },
    {
      storeSlug: 'telemart',
      bank_name: 'UBL',
      card_type: 'Credit Card',
      discount_percent: null,
      cashback_percent: 8,
      description: '8% cashback on UBL Digital Mastercard credit cards on all orders above Rs. 20,000.',
    },
    // Shophive
    {
      storeSlug: 'shophive',
      bank_name: 'Bank Alfalah',
      card_type: 'Credit Card',
      discount_percent: 10,
      cashback_percent: null,
      description: '10% discount (up to Rs. 5,000) on Alfa credit cards on branded audio, wireless earbuds, and tablets.',
    },
    {
      storeSlug: 'shophive',
      bank_name: 'HBL',
      card_type: 'Debit Card',
      discount_percent: 8,
      cashback_percent: null,
      description: '8% off with HBL Debit Card on IT peripherals, storage drives, and laptop accessories.',
    },
    // Mega.pk
    {
      storeSlug: 'mega-pk',
      bank_name: 'Meezan Bank',
      card_type: 'Debit Card',
      discount_percent: 10,
      cashback_percent: null,
      description: '10% discount on Meezan Islamic debit cards on laptops, cameras, and gaming monitors.',
    },
    {
      storeSlug: 'mega-pk',
      bank_name: 'Standard Chartered',
      card_type: 'Credit Card',
      discount_percent: 12,
      cashback_percent: null,
      description: '12% discount (up to Rs. 8,000) on Standard Chartered credit cards on Apple MacBooks and workstations.',
    },
    // Naheed
    {
      storeSlug: 'naheed',
      bank_name: 'HBL',
      card_type: 'All Cards',
      discount_percent: 15,
      cashback_percent: null,
      description: '15% savings every Wednesday with HBL Credit & Debit cards on personal care and electronics.',
    },
    // Al-Fatah
    {
      storeSlug: 'al-fatah',
      bank_name: 'UBL',
      card_type: 'Credit Card',
      discount_percent: 10,
      cashback_percent: null,
      description: '10% discount (up to Rs. 3,000) with UBL credit cards on home appliances and tech gadgets.',
    },
  ];

  const bankOffersToInsert = bankOfferTemplates.map(t => {
    const store_id = storeMap.get(t.storeSlug);
    if (!store_id) throw new Error(`Missing store_id for ${t.storeSlug}`);
    return {
      store_id,
      bank_name: t.bank_name,
      card_type: t.card_type,
      discount_percent: t.discount_percent,
      cashback_percent: t.cashback_percent,
      description: t.description,
      valid_from: VALID_FROM,
      valid_until: VALID_UNTIL,
      is_active: true,
    };
  });

  const { error: boErr } = await supabase.from('bank_offers').insert(bankOffersToInsert);
  if (boErr) {
    console.error('Error inserting bank_offers:', boErr);
  } else {
    console.log(`✓ Seeded ${bankOffersToInsert.length} active bank offers into bank_offers.`);
  }

  // ── 2. Coupons ─────────────────────────────────────────────────
  const couponTemplates = [
    // PriceOye
    {
      storeSlug: 'priceoye',
      code: 'PO500',
      discount_type: 'fixed' as const,
      discount_value: 500,
      min_order: 10000,
      description: 'Flat Rs. 500 off on your purchase above Rs. 10,000 on PriceOye.',
    },
    {
      storeSlug: 'priceoye',
      code: 'APPFIRST',
      discount_type: 'percent' as const,
      discount_value: 5,
      min_order: 5000,
      description: '5% extra discount (up to Rs. 1,000) on your first PriceOye mobile app order.',
    },
    // Telemart
    {
      storeSlug: 'telemart',
      code: 'TMDEAL1000',
      discount_type: 'fixed' as const,
      discount_value: 1000,
      min_order: 25000,
      description: 'Flat Rs. 1,000 discount on smart gadgets and appliances on orders above Rs. 25,000.',
    },
    {
      storeSlug: 'telemart',
      code: 'SUPERTECH',
      discount_type: 'percent' as const,
      discount_value: 8,
      min_order: 15000,
      description: '8% off on gaming accessories and headphones with promo code SUPERTECH.',
    },
    // Shophive
    {
      storeSlug: 'shophive',
      code: 'SHOPSAVE',
      discount_type: 'fixed' as const,
      discount_value: 750,
      min_order: 12000,
      description: 'Rs. 750 off across storewide electronics on minimum cart value of Rs. 12,000.',
    },
    {
      storeSlug: 'shophive',
      code: 'HIVE500',
      discount_type: 'fixed' as const,
      discount_value: 500,
      min_order: 8000,
      description: 'Instant Rs. 500 discount on audio, earbuds, and smart wearables.',
    },
    // Naheed
    {
      storeSlug: 'naheed',
      code: 'NAHEED10',
      discount_type: 'percent' as const,
      discount_value: 10,
      min_order: 5000,
      description: '10% off (up to Rs. 1,500) on electronic accessories and household tech.',
    },
    // Al-Fatah
    {
      storeSlug: 'al-fatah',
      code: 'ONLINE1000',
      discount_type: 'fixed' as const,
      discount_value: 1000,
      min_order: 20000,
      description: 'Flat Rs. 1,000 off on web orders over Rs. 20,000 across personal care & gadgets.',
    },
  ];

  const couponsToInsert = couponTemplates.map(t => {
    const store_id = storeMap.get(t.storeSlug);
    if (!store_id) throw new Error(`Missing store_id for ${t.storeSlug}`);
    return {
      store_id,
      code: t.code,
      discount_type: t.discount_type,
      discount_value: t.discount_value,
      min_order: t.min_order,
      description: t.description,
      valid_from: VALID_FROM,
      valid_until: VALID_UNTIL,
      is_active: true,
    };
  });

  const { error: cErr } = await supabase.from('coupons').insert(couponsToInsert);
  if (cErr) {
    console.error('Error inserting coupons:', cErr);
  } else {
    console.log(`✓ Seeded ${couponsToInsert.length} active coupons into coupons.`);
  }

  // Verify final counts
  const { count: finalBankCount } = await supabase.from('bank_offers').select('*', { count: 'exact', head: true });
  const { count: finalCouponCount } = await supabase.from('coupons').select('*', { count: 'exact', head: true });
  console.log(`\nFinal State:`);
  console.log(`  - bank_offers: ${finalBankCount} active rows (valid through 2027)`);
  console.log(`  - coupons:     ${finalCouponCount} active rows (valid through 2027)`);
}

main().catch(console.error);
