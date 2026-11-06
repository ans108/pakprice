-- =============================================================
-- PakPrice: Migration 004 — Product Catalog (Phase 2)
-- =============================================================
-- Run AFTER 001_initial_schema.sql, 002_rls_policies.sql, 003_seed_stores.sql
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds Phase 3 scraper-prep columns to product_variants, products, brands
--      (uses ADD COLUMN IF NOT EXISTS — safe to re-run)
--   2. Adds search/filter performance indexes
--      (uses CREATE INDEX IF NOT EXISTS — safe to re-run)
--   3. Seeds hierarchical categories for Pakistani e-commerce
--      (uses ON CONFLICT DO NOTHING — idempotent)
--   4. Seeds major brands relevant to Pakistani market
--      (uses ON CONFLICT DO NOTHING — idempotent)
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   • Does NOT recreate extensions (pg_trgm already enabled in 001)
--   • Does NOT recreate existing tables, columns, or indexes
--   • Does NOT seed products (Phase 3 scrapers will do that)
--   • Does NOT add new RLS policies (002 already covers public read)
-- =============================================================

-- =============================================================
-- SECTION 1: SCHEMA ADDITIONS
-- All additions are non-breaking and idempotent.
-- =============================================================

-- ── product_variants: Phase 3 scraper-matching fields ────────
-- sku: store-specific stock-keeping unit (e.g. "SM-A566BLBDPAK")
-- gtin: Global Trade Item Number / EAN / UPC barcode (universal)
-- normalized_name: lowercased, whitespace-collapsed variant label
--   e.g. "8gb / 128gb / awesome navy" — used for deduplication
-- source_identifier: opaque key used by Phase 3 scrapers to
--   re-match variants across scrape runs without relying on names
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS sku               TEXT,
  ADD COLUMN IF NOT EXISTS gtin              TEXT,
  ADD COLUMN IF NOT EXISTS normalized_name   TEXT,
  ADD COLUMN IF NOT EXISTS source_identifier TEXT;

-- ── products: normalized name for dedup / fuzzy matching ─────
-- normalized_name: lowercase, trimmed product name used by Phase 3
--   scraper matching and search ranking
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- ── brands: normalized name for matching ─────────────────────
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- =============================================================
-- SECTION 2: INDEXES
-- All use IF NOT EXISTS — idempotent and safe to re-run.
-- =============================================================

-- Trigram search on variant names
-- Complements the existing idx_products_name_trgm (created in 001)
CREATE INDEX IF NOT EXISTS idx_product_variants_name_trgm
  ON product_variants USING gin(name gin_trgm_ops);

-- Exact-match search on variant normalized_name
CREATE INDEX IF NOT EXISTS idx_product_variants_normalized_name
  ON product_variants(normalized_name);

-- Exact-match search on product normalized_name
CREATE INDEX IF NOT EXISTS idx_products_normalized_name
  ON products(normalized_name);

-- Composite index for category + brand filter queries
-- e.g. GET /api/v1/products?category=mobiles&brand=samsung
CREATE INDEX IF NOT EXISTS idx_products_brand_category
  ON products(brand_id, category_id)
  WHERE is_active = TRUE;

-- SKU lookup (Phase 3 scraper matching)
CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON product_variants(sku)
  WHERE sku IS NOT NULL;

-- GTIN lookup (Phase 3 barcode matching)
CREATE INDEX IF NOT EXISTS idx_product_variants_gtin
  ON product_variants(gtin)
  WHERE gtin IS NOT NULL;

-- =============================================================
-- SECTION 3: CATEGORIES SEED (production data)
-- =============================================================
-- All INSERTs use ON CONFLICT (slug) DO NOTHING — idempotent.
-- Slugs are stable and must never change after seeding.
-- sort_order controls display order within each level.
-- =============================================================

-- ── Root categories ─────────────────────────────────────────

INSERT INTO categories (name, slug, parent_id, icon_url, sort_order)
VALUES
  ('Electronics',       'electronics',      NULL, NULL, 10),
  ('Home Appliances',   'home-appliances',  NULL, NULL, 20),
  ('Gaming',            'gaming',           NULL, NULL, 30),
  ('Kitchen',           'kitchen',          NULL, NULL, 40),
  ('Sports & Fitness',  'sports-fitness',   NULL, NULL, 50)
ON CONFLICT (slug) DO NOTHING;

-- ── Electronics sub-categories ──────────────────────────────

INSERT INTO categories (name, slug, parent_id, icon_url, sort_order)
SELECT
  sub.name,
  sub.slug,
  c.id,   -- parent = Electronics
  NULL,
  sub.sort_order
FROM (VALUES
  ('Mobiles',              'mobiles',              11),
  ('Laptops',              'laptops',              12),
  ('Tablets',              'tablets',              13),
  ('Desktop Computers',    'desktop-computers',    14),
  ('Monitors',             'monitors',             15),
  ('TVs',                  'tvs',                  16),
  ('Headphones & Audio',   'headphones-audio',     17),
  ('Smart Watches',        'smart-watches',        18),
  ('Cameras',              'cameras',              19),
  ('Computer Accessories', 'computer-accessories', 20),
  ('Networking',           'networking',           21),
  ('Printers',             'printers',             22)
) AS sub(name, slug, sort_order)
JOIN categories c ON c.slug = 'electronics'
ON CONFLICT (slug) DO NOTHING;

-- ── Home Appliances sub-categories ──────────────────────────

INSERT INTO categories (name, slug, parent_id, icon_url, sort_order)
SELECT
  sub.name,
  sub.slug,
  c.id,   -- parent = Home Appliances
  NULL,
  sub.sort_order
FROM (VALUES
  ('Refrigerators',    'refrigerators',    21),
  ('Washing Machines', 'washing-machines', 22),
  ('Air Conditioners', 'air-conditioners', 23),
  ('Microwave Ovens',  'microwave-ovens',  24),
  ('Vacuum Cleaners',  'vacuum-cleaners',  25),
  ('Water Dispensers', 'water-dispensers', 26),
  ('Iron & Steamers',  'iron-steamers',    27)
) AS sub(name, slug, sort_order)
JOIN categories c ON c.slug = 'home-appliances'
ON CONFLICT (slug) DO NOTHING;

-- ── Gaming sub-categories ────────────────────────────────────

INSERT INTO categories (name, slug, parent_id, icon_url, sort_order)
SELECT
  sub.name,
  sub.slug,
  c.id,   -- parent = Gaming
  NULL,
  sub.sort_order
FROM (VALUES
  ('Consoles',             'gaming-consoles',       31),
  ('Gaming Laptops',       'gaming-laptops',         32),
  ('Graphics Cards',       'graphics-cards',         33),
  ('Gaming Accessories',   'gaming-accessories',     34),
  ('Gaming Chairs',        'gaming-chairs',          35)
) AS sub(name, slug, sort_order)
JOIN categories c ON c.slug = 'gaming'
ON CONFLICT (slug) DO NOTHING;

-- =============================================================
-- SECTION 4: BRANDS SEED (production data)
-- =============================================================
-- All INSERTs use ON CONFLICT (slug) DO NOTHING — idempotent.
-- normalized_name is pre-computed lowercase for consistent matching.
-- Slugs are stable and must never change after seeding.
-- =============================================================

INSERT INTO brands (name, slug, logo_url, normalized_name)
VALUES
  -- Mobile brands dominant in Pakistan
  ('Samsung',   'samsung',   NULL, 'samsung'),
  ('Apple',     'apple',     NULL, 'apple'),
  ('Xiaomi',    'xiaomi',    NULL, 'xiaomi'),
  ('Oppo',      'oppo',      NULL, 'oppo'),
  ('Vivo',      'vivo',      NULL, 'vivo'),
  ('Realme',    'realme',    NULL, 'realme'),
  ('OnePlus',   'oneplus',   NULL, 'oneplus'),
  ('Infinix',   'infinix',   NULL, 'infinix'),
  ('Tecno',     'tecno',     NULL, 'tecno'),
  ('Google',    'google',    NULL, 'google'),
  ('Nokia',     'nokia',     NULL, 'nokia'),
  ('Huawei',    'huawei',    NULL, 'huawei'),
  -- Laptops/PC brands
  ('HP',        'hp',        NULL, 'hp'),
  ('Dell',      'dell',      NULL, 'dell'),
  ('Lenovo',    'lenovo',    NULL, 'lenovo'),
  ('Asus',      'asus',      NULL, 'asus'),
  ('Acer',      'acer',      NULL, 'acer'),
  ('MSI',       'msi',       NULL, 'msi'),
  ('Microsoft', 'microsoft', NULL, 'microsoft'),
  -- TVs / Appliances
  ('Sony',      'sony',      NULL, 'sony'),
  ('LG',        'lg',        NULL, 'lg'),
  ('TCL',       'tcl',       NULL, 'tcl'),
  ('Haier',     'haier',     NULL, 'haier'),
  ('Hisense',   'hisense',   NULL, 'hisense'),
  ('Dawlance',  'dawlance',  NULL, 'dawlance'),
  ('PEL',       'pel',       NULL, 'pel'),
  ('Orient',    'orient',    NULL, 'orient'),
  -- Gaming
  ('PlayStation', 'playstation', NULL, 'playstation'),
  ('Xbox',        'xbox',        NULL, 'xbox'),
  ('Nintendo',    'nintendo',    NULL, 'nintendo'),
  -- Other
  ('Dyson',     'dyson',     NULL, 'dyson'),
  ('JBL',       'jbl',       NULL, 'jbl'),
  ('Anker',     'anker',     NULL, 'anker')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================
-- END OF MIGRATION 004
-- =============================================================
-- Next steps:
--   • Phase 3 scrapers will INSERT/UPSERT products, product_variants,
--     and prices using the service-role key.
--   • If you need sample data for local UI testing, run:
--       database/seeds/dev_products.sql
--     against your local/dev Supabase instance ONLY.
--     Never run dev_products.sql in production.
-- =============================================================
