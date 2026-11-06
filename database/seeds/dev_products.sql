-- =============================================================
-- PakPrice: DEV SEED — Sample Products
-- =============================================================
-- ⚠️  DEV ONLY — NEVER run this in production.
-- ⚠️  This file is NOT executed by npm install, migrations,
--     or any application startup script.
-- ⚠️  Run manually against your LOCAL/DEV Supabase instance only:
--
--     psql $DATABASE_URL -f database/seeds/dev_products.sql
--
-- PURPOSE:
--   Provides a small set of clearly labelled sample products and
--   variants so developers can test the Phase 2 UI without waiting
--   for Phase 3 scrapers.
--
-- CLEANUP:
--   To remove all dev seed data:
--     DELETE FROM products WHERE slug LIKE 'dev-%';
--   (Cascades to product_variants via ON DELETE CASCADE)
-- =============================================================

-- Use a DO block so we can reference brand/category IDs by slug
DO $$
DECLARE
  brand_samsung    UUID;
  brand_apple      UUID;
  brand_xiaomi     UUID;
  brand_hp         UUID;
  brand_sony       UUID;
  cat_mobiles      UUID;
  cat_laptops      UUID;
  cat_tvs          UUID;
  prod_a56         UUID;
  prod_iphone16    UUID;
  prod_redmi13     UUID;
  prod_spectre     UUID;
  prod_bravia      UUID;
BEGIN

  -- ── Resolve brand IDs ──────────────────────────────────────
  SELECT id INTO brand_samsung FROM brands WHERE slug = 'samsung';
  SELECT id INTO brand_apple   FROM brands WHERE slug = 'apple';
  SELECT id INTO brand_xiaomi  FROM brands WHERE slug = 'xiaomi';
  SELECT id INTO brand_hp      FROM brands WHERE slug = 'hp';
  SELECT id INTO brand_sony    FROM brands WHERE slug = 'sony';

  -- ── Resolve category IDs ───────────────────────────────────
  SELECT id INTO cat_mobiles FROM categories WHERE slug = 'mobiles';
  SELECT id INTO cat_laptops FROM categories WHERE slug = 'laptops';
  SELECT id INTO cat_tvs     FROM categories WHERE slug = 'tvs';

  -- Abort if seeds are missing (migration 004 not yet run)
  IF brand_samsung IS NULL THEN
    RAISE EXCEPTION 'brands seed not found — run migration 004 first';
  END IF;
  IF cat_mobiles IS NULL THEN
    RAISE EXCEPTION 'categories seed not found — run migration 004 first';
  END IF;

  -- =============================================================
  -- PRODUCT 1: Samsung Galaxy A56
  -- =============================================================
  INSERT INTO products (name, slug, brand_id, category_id, description, image_url, is_active, normalized_name)
  VALUES (
    'Samsung Galaxy A56',
    'dev-samsung-galaxy-a56',
    brand_samsung,
    cat_mobiles,
    '[DEV SEED] Samsung Galaxy A56 5G — mid-range Android smartphone. 6.7" Super AMOLED display, 50MP triple camera, 5000mAh battery.',
    NULL,
    TRUE,
    'samsung galaxy a56'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO prod_a56;

  -- If product already existed, get its ID
  IF prod_a56 IS NULL THEN
    SELECT id INTO prod_a56 FROM products WHERE slug = 'dev-samsung-galaxy-a56';
  END IF;

  -- Variants for Galaxy A56
  INSERT INTO product_variants (product_id, name, ram_gb, storage_gb, color, model_number, normalized_name, is_active)
  VALUES
    (prod_a56, '8GB / 128GB / Awesome Navy',    8,  128, 'Awesome Navy',      'SM-A566BLBDPAK', '8gb 128gb awesome navy',    TRUE),
    (prod_a56, '8GB / 256GB / Awesome Navy',    8,  256, 'Awesome Navy',      'SM-A566BLBDPAK', '8gb 256gb awesome navy',    TRUE),
    (prod_a56, '12GB / 256GB / Awesome Navy',  12,  256, 'Awesome Navy',      'SM-A566BWBDPAK', '12gb 256gb awesome navy',   TRUE),
    (prod_a56, '12GB / 256GB / Awesome White', 12,  256, 'Awesome White',     'SM-A566BWBDPAK', '12gb 256gb awesome white',  TRUE),
    (prod_a56, '8GB / 128GB / Awesome Graphite', 8, 128, 'Awesome Graphite',  'SM-A566BBKDPAK', '8gb 128gb awesome graphite',TRUE)
  ON CONFLICT (product_id, ram_gb, storage_gb, color, model_number) DO NOTHING;

  -- =============================================================
  -- PRODUCT 2: Apple iPhone 16
  -- =============================================================
  INSERT INTO products (name, slug, brand_id, category_id, description, image_url, is_active, normalized_name)
  VALUES (
    'Apple iPhone 16',
    'dev-apple-iphone-16',
    brand_apple,
    cat_mobiles,
    '[DEV SEED] Apple iPhone 16 — A18 chip, 48MP Fusion camera, Action Button, USB-C. Available in multiple storage configurations.',
    NULL,
    TRUE,
    'apple iphone 16'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO prod_iphone16;

  IF prod_iphone16 IS NULL THEN
    SELECT id INTO prod_iphone16 FROM products WHERE slug = 'dev-apple-iphone-16';
  END IF;

  INSERT INTO product_variants (product_id, name, ram_gb, storage_gb, color, model_number, normalized_name, is_active)
  VALUES
    (prod_iphone16, '8GB / 128GB / Black',  8, 128, 'Black',   'MXWK3PK/A', '8gb 128gb black', TRUE),
    (prod_iphone16, '8GB / 256GB / Black',  8, 256, 'Black',   'MXWL3PK/A', '8gb 256gb black', TRUE),
    (prod_iphone16, '8GB / 256GB / White',  8, 256, 'White',   'MXWM3PK/A', '8gb 256gb white', TRUE),
    (prod_iphone16, '8GB / 512GB / Black',  8, 512, 'Black',   'MXWN3PK/A', '8gb 512gb black', TRUE),
    (prod_iphone16, '8GB / 128GB / Teal',   8, 128, 'Teal',    'MXWP3PK/A', '8gb 128gb teal',  TRUE)
  ON CONFLICT (product_id, ram_gb, storage_gb, color, model_number) DO NOTHING;

  -- =============================================================
  -- PRODUCT 3: Xiaomi Redmi Note 13
  -- =============================================================
  INSERT INTO products (name, slug, brand_id, category_id, description, image_url, is_active, normalized_name)
  VALUES (
    'Xiaomi Redmi Note 13',
    'dev-xiaomi-redmi-note-13',
    brand_xiaomi,
    cat_mobiles,
    '[DEV SEED] Xiaomi Redmi Note 13 — 6.67" AMOLED display, 108MP main camera, 5000mAh battery, 33W fast charging.',
    NULL,
    TRUE,
    'xiaomi redmi note 13'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO prod_redmi13;

  IF prod_redmi13 IS NULL THEN
    SELECT id INTO prod_redmi13 FROM products WHERE slug = 'dev-xiaomi-redmi-note-13';
  END IF;

  INSERT INTO product_variants (product_id, name, ram_gb, storage_gb, color, model_number, normalized_name, is_active)
  VALUES
    (prod_redmi13, '6GB / 128GB / Midnight Black',  6, 128, 'Midnight Black',  '23106RN0DG', '6gb 128gb midnight black', TRUE),
    (prod_redmi13, '8GB / 256GB / Midnight Black',  8, 256, 'Midnight Black',  '23106RN0DG', '8gb 256gb midnight black', TRUE),
    (prod_redmi13, '8GB / 256GB / Stardust Purple', 8, 256, 'Stardust Purple', '23106RN0DG', '8gb 256gb stardust purple', TRUE),
    (prod_redmi13, '6GB / 128GB / Ice Blue',        6, 128, 'Ice Blue',        '23106RN0DG', '6gb 128gb ice blue',       TRUE)
  ON CONFLICT (product_id, ram_gb, storage_gb, color, model_number) DO NOTHING;

  -- =============================================================
  -- PRODUCT 4: HP Spectre x360 14 (Laptop)
  -- =============================================================
  INSERT INTO products (name, slug, brand_id, category_id, description, image_url, is_active, normalized_name)
  VALUES (
    'HP Spectre x360 14',
    'dev-hp-spectre-x360-14',
    brand_hp,
    cat_laptops,
    '[DEV SEED] HP Spectre x360 14 — Intel Core Ultra 7, 2.8K OLED touchscreen, 360° convertible design.',
    NULL,
    TRUE,
    'hp spectre x360 14'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO prod_spectre;

  IF prod_spectre IS NULL THEN
    SELECT id INTO prod_spectre FROM products WHERE slug = 'dev-hp-spectre-x360-14';
  END IF;

  INSERT INTO product_variants (product_id, name, ram_gb, storage_gb, color, model_number, normalized_name, is_active)
  VALUES
    (prod_spectre, '16GB / 512GB / Nightfall Black',  16, 512,  'Nightfall Black', 'HP-SX360-14-NB', '16gb 512gb nightfall black',  TRUE),
    (prod_spectre, '32GB / 1024GB / Nightfall Black', 32, 1024, 'Nightfall Black', 'HP-SX360-14-NB', '32gb 1024gb nightfall black', TRUE),
    (prod_spectre, '16GB / 512GB / Natural Silver',   16, 512,  'Natural Silver',  'HP-SX360-14-NS', '16gb 512gb natural silver',   TRUE)
  ON CONFLICT (product_id, ram_gb, storage_gb, color, model_number) DO NOTHING;

  -- =============================================================
  -- PRODUCT 5: Sony Bravia 55" 4K TV
  -- =============================================================
  INSERT INTO products (name, slug, brand_id, category_id, description, image_url, is_active, normalized_name)
  VALUES (
    'Sony Bravia XR-55X90L',
    'dev-sony-bravia-xr55x90l',
    brand_sony,
    cat_tvs,
    '[DEV SEED] Sony Bravia XR-55X90L — 55" Full Array LED 4K TV, Cognitive Processor XR, Google TV, HDMI 2.1.',
    NULL,
    TRUE,
    'sony bravia xr55x90l'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO prod_bravia;

  IF prod_bravia IS NULL THEN
    SELECT id INTO prod_bravia FROM products WHERE slug = 'dev-sony-bravia-xr55x90l';
  END IF;

  -- TV has no RAM/storage — uses single "no-spec" variant
  INSERT INTO product_variants (product_id, name, ram_gb, storage_gb, color, model_number, normalized_name, is_active)
  VALUES
    (prod_bravia, 'Black / XR-55X90L', NULL, NULL, 'Black', 'XR-55X90L', 'black xr-55x90l', TRUE)
  ON CONFLICT (product_id, ram_gb, storage_gb, color, model_number) DO NOTHING;

END $$;
