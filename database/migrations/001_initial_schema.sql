-- =============================================================
-- PakPrice: Migration 001 — Initial Schema
-- =============================================================
-- Run this migration in the Supabase SQL editor or via psql.
-- All tables are designed to be future-ready for Phase 3 scraping.
--
-- KEY DESIGN DECISIONS:
--   • products   = model/family level (e.g. "Samsung Galaxy A56")
--   • product_variants = exact purchasable config (RAM + storage + color + model_number)
--   • image_url columns:
--       - Must be absolute HTTPS URLs or NULL.
--       - NULL means "no image" — frontend shows a placeholder.
--       - Variant image falls back to product image when NULL.
--       - CHECK constraints prevent empty strings and relative URLs.
--   • store_product_identifiers = store-specific SKUs/IDs for Phase 3 scraper matching.
--   • UNIQUE NULLS NOT DISTINCT on product_variants prevents duplicate configs.
--     Requires PostgreSQL 15+ (available on Supabase).
-- =============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For future full-text search on product names

-- =============================================================
-- CATEGORIES
-- =============================================================
CREATE TABLE categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  parent_id   UUID        REFERENCES categories(id) ON DELETE SET NULL,
  -- icon_url must be an absolute HTTPS URL or NULL
  icon_url    TEXT        CHECK (icon_url IS NULL OR (icon_url ~* '^https://' AND length(icon_url) > 8)),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug      ON categories(slug);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_sort_order ON categories(sort_order);

-- =============================================================
-- BRANDS
-- =============================================================
CREATE TABLE brands (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  -- logo_url must be an absolute HTTPS URL or NULL
  logo_url   TEXT        CHECK (logo_url IS NULL OR (logo_url ~* '^https://' AND length(logo_url) > 8)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brands_slug ON brands(slug);

-- =============================================================
-- PRODUCTS (model/family level)
--
-- A product is the model family, e.g. "Samsung Galaxy A56".
-- The specific purchasable configuration (8GB/128GB/Black) is a ProductVariant.
-- This table stores the shared identity, description, and primary image.
-- =============================================================
CREATE TABLE products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  brand_id    UUID        REFERENCES brands(id) ON DELETE SET NULL,
  category_id UUID        REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  --
  -- image_url: The primary/representative image for the product family.
  -- Must be an absolute HTTPS URL or NULL.
  -- NULL means no image has been sourced yet — never store empty strings.
  -- Used as the fallback when a variant does not have its own image.
  --
  image_url   TEXT        CHECK (image_url IS NULL OR (image_url ~* '^https://' AND length(image_url) > 8)),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_slug        ON products(slug);
CREATE INDEX idx_products_brand_id    ON products(brand_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active   ON products(is_active);
-- GIN trigram index enables fast ILIKE / similarity search on product names (Phase 2+)
CREATE INDEX idx_products_name_trgm   ON products USING gin(name gin_trgm_ops);

-- =============================================================
-- PRODUCT VARIANTS (exact purchasable configuration)
--
-- Each row is a unique combination of:
--   product_id + ram_gb + storage_gb + color + model_number
--
-- Examples for "Samsung Galaxy A56":
--   Variant 1 → 8GB / 128GB / Awesome Navy   / SM-A566BLBD
--   Variant 2 → 8GB / 256GB / Awesome Navy   / SM-A566BLBD (diff storage)
--   Variant 3 → 12GB / 256GB / Awesome White / SM-A566BWBD
--
-- Fields that don't apply to a product category (e.g., color for a router)
-- can be NULL. The UNIQUE constraint uses NULLS NOT DISTINCT so that two rows
-- cannot have the same (product_id, NULL, NULL, NULL, NULL) — only one
-- "no-spec" variant is allowed per product.
-- =============================================================
CREATE TABLE product_variants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Human-readable label auto-set by application, e.g. "8GB / 128GB / Awesome Navy"
  name         TEXT        NOT NULL,
  -- RAM in GB; NULL for products where RAM is not applicable
  ram_gb       INTEGER     CHECK (ram_gb IS NULL OR ram_gb > 0),
  -- Storage in GB; NULL for products without onboard storage
  storage_gb   INTEGER     CHECK (storage_gb IS NULL OR storage_gb > 0),
  -- Color name as displayed by the store, e.g. "Awesome Navy", "Titanium Black"
  color        TEXT,
  -- Manufacturer model number, store-agnostic, e.g. "SM-A566BLBDPAK"
  model_number TEXT,
  --
  -- image_url: Variant-specific image (e.g., the exact color variant photo).
  -- Must be an absolute HTTPS URL or NULL.
  -- If NULL, the frontend MUST fall back to the parent product's image_url.
  -- If the parent image_url is also NULL, show a static placeholder.
  -- Never render a broken <img> tag — always resolve to a displayable image.
  --
  image_url    TEXT        CHECK (image_url IS NULL OR (image_url ~* '^https://' AND length(image_url) > 8)),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate variant configurations for the same product.
  -- NULLS NOT DISTINCT: two NULLs in the same column are treated as equal.
  -- Requires PostgreSQL 15+ (available on Supabase).
  UNIQUE NULLS NOT DISTINCT (product_id, ram_gb, storage_gb, color, model_number)
);

CREATE INDEX idx_product_variants_product_id   ON product_variants(product_id);
CREATE INDEX idx_product_variants_is_active    ON product_variants(is_active);
CREATE INDEX idx_product_variants_model_number ON product_variants(model_number);
CREATE INDEX idx_product_variants_color        ON product_variants(color);

-- =============================================================
-- STORES
-- =============================================================
CREATE TABLE stores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  base_url    TEXT        NOT NULL CHECK (base_url ~* '^https?://'),
  -- logo_url must be an absolute HTTPS URL or NULL
  -- If NULL, the frontend shows the store initials as a fallback badge
  logo_url    TEXT        CHECK (logo_url IS NULL OR (logo_url ~* '^https://' AND length(logo_url) > 8)),
  -- scraper_key: short unique identifier for the Phase 3 scraper module
  -- e.g. "daraz", "priceoye", "mega_pk"
  scraper_key TEXT        NOT NULL UNIQUE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_slug       ON stores(slug);
CREATE INDEX idx_stores_is_active  ON stores(is_active);
CREATE INDEX idx_stores_sort_order ON stores(sort_order);

-- =============================================================
-- STORE PRODUCT IDENTIFIERS
--
-- Maps a product variant to a store-specific identifier.
-- This table is critical for Phase 3 scraping: it allows the scraper
-- to reliably locate and match a product variant on each store's website
-- without depending on product names (which can differ across stores).
--
-- identifier_type values:
--   'sku'        — Store's internal stock-keeping unit
--   'url_slug'   — The URL path segment for the product page
--   'product_id' — Numeric/string ID used in the store's API or DOM
--   'barcode'    — EAN/UPC barcode (universal, not store-specific)
--   'asin'       — Amazon Standard Identification Number (for Daraz)
-- =============================================================
CREATE TABLE store_product_identifiers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      UUID        NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  identifier      TEXT        NOT NULL,
  identifier_type TEXT        NOT NULL DEFAULT 'url_slug'
                              CHECK (identifier_type IN ('sku', 'url_slug', 'product_id', 'barcode', 'asin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One identifier per type per variant per store
  UNIQUE (variant_id, store_id, identifier_type)
);

CREATE INDEX idx_store_product_ids_variant_id  ON store_product_identifiers(variant_id);
CREATE INDEX idx_store_product_ids_store_id    ON store_product_identifiers(store_id);
CREATE INDEX idx_store_product_ids_identifier  ON store_product_identifiers(identifier);

-- =============================================================
-- PRICES (current price — one row per variant per store)
-- Updated by the scraper on each run.
-- =============================================================
CREATE TABLE prices (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id              UUID           NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  store_id                UUID           NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Listed sale price in PKR
  price                   NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  -- Original/MRP before discount; NULL if store does not show it
  original_price          NUMERIC(12,2)  CHECK (original_price IS NULL OR original_price >= 0),
  -- Discount percentage; NULL if no original_price available
  discount_percent        NUMERIC(5,2)   CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  -- Shipping fee in PKR; 0 = free shipping
  shipping_fee            NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  -- Minimum cart value for free shipping; NULL if always paid or always free
  min_order_free_shipping NUMERIC(12,2)  CHECK (min_order_free_shipping IS NULL OR min_order_free_shipping >= 0),
  -- Discount from applicable coupons in PKR
  coupon_discount         NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  -- Discount from bank/card offers in PKR
  bank_discount           NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (bank_discount >= 0),
  -- Computed column: price - coupon_discount - bank_discount
  final_price             NUMERIC(12,2)  GENERATED ALWAYS AS (
                            GREATEST(price - coupon_discount - bank_discount, 0)
                          ) STORED,
  in_stock                BOOLEAN        NOT NULL DEFAULT TRUE,
  stock_count             INTEGER        CHECK (stock_count IS NULL OR stock_count >= 0),
  -- Direct URL to the product listing on the store's website
  product_url             TEXT           CHECK (product_url IS NULL OR product_url ~* '^https?://'),
  last_scraped_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- One price record per variant per store (upserted by scraper)
  UNIQUE (variant_id, store_id)
);

CREATE INDEX idx_prices_variant_id      ON prices(variant_id);
CREATE INDEX idx_prices_store_id        ON prices(store_id);
CREATE INDEX idx_prices_final_price     ON prices(final_price);
CREATE INDEX idx_prices_in_stock        ON prices(in_stock);
CREATE INDEX idx_prices_last_scraped_at ON prices(last_scraped_at);

-- =============================================================
-- PRICE HISTORY (append-only snapshots — never updated)
-- =============================================================
CREATE TABLE price_history (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     UUID           NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  store_id       UUID           NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price          NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  original_price NUMERIC(12,2)  CHECK (original_price IS NULL OR original_price >= 0),
  shipping_fee   NUMERIC(10,2)  NOT NULL DEFAULT 0,
  in_stock       BOOLEAN        NOT NULL DEFAULT TRUE,
  scraped_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_history_variant_id    ON price_history(variant_id);
CREATE INDEX idx_price_history_store_id      ON price_history(store_id);
CREATE INDEX idx_price_history_scraped_at    ON price_history(scraped_at);
-- Composite index for the common query: get history for a variant across stores
CREATE INDEX idx_price_history_variant_store ON price_history(variant_id, store_id);

-- =============================================================
-- COUPONS (schema only — Phase 3 implementation)
-- =============================================================
CREATE TABLE coupons (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID           NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           TEXT           NOT NULL,
  description    TEXT,
  discount_type  TEXT           NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2)  NOT NULL CHECK (discount_value > 0),
  min_order      NUMERIC(12,2)  CHECK (min_order IS NULL OR min_order >= 0),
  valid_from     TIMESTAMPTZ,
  valid_until    TIMESTAMPTZ,
  is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_store_id    ON coupons(store_id);
CREATE INDEX idx_coupons_is_active   ON coupons(is_active);
CREATE INDEX idx_coupons_valid_until ON coupons(valid_until);

-- =============================================================
-- BANK OFFERS (schema only — Phase 3 implementation)
-- =============================================================
CREATE TABLE bank_offers (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bank_name        TEXT          NOT NULL,
  -- e.g. 'Visa', 'Mastercard', 'UnionPay', or NULL for all card types
  card_type        TEXT,
  discount_percent NUMERIC(5,2)  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  cashback_percent NUMERIC(5,2)  CHECK (cashback_percent IS NULL OR (cashback_percent >= 0 AND cashback_percent <= 100)),
  description      TEXT,
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_offers_store_id    ON bank_offers(store_id);
CREATE INDEX idx_bank_offers_is_active   ON bank_offers(is_active);
CREATE INDEX idx_bank_offers_valid_until ON bank_offers(valid_until);

-- =============================================================
-- USER PROFILES (extends Supabase auth.users)
-- id references auth.users — managed by Supabase Auth
-- =============================================================
CREATE TABLE user_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT        CHECK (avatar_url IS NULL OR (avatar_url ~* '^https://' AND length(avatar_url) > 8)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- FAVORITES
-- =============================================================
CREATE TABLE favorites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id UUID        NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, variant_id)
);

CREATE INDEX idx_favorites_user_id    ON favorites(user_id);
CREATE INDEX idx_favorites_variant_id ON favorites(variant_id);

-- =============================================================
-- SEARCH HISTORY
-- =============================================================
CREATE TABLE search_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query        TEXT        NOT NULL,
  result_count INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_history_user_id    ON search_history(user_id);
CREATE INDEX idx_search_history_created_at ON search_history(created_at);

-- =============================================================
-- PRICE ALERTS
-- =============================================================
CREATE TABLE price_alerts (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id   UUID          NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  target_price NUMERIC(12,2) NOT NULL CHECK (target_price > 0),
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- One alert per user per variant
  UNIQUE (user_id, variant_id)
);

CREATE INDEX idx_price_alerts_user_id    ON price_alerts(user_id);
CREATE INDEX idx_price_alerts_variant_id ON price_alerts(variant_id);
CREATE INDEX idx_price_alerts_is_active  ON price_alerts(is_active);

-- =============================================================
-- SCRAPE JOBS
-- =============================================================
CREATE TABLE scrape_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID        REFERENCES stores(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  products_scraped INTEGER     NOT NULL DEFAULT 0,
  errors_count     INTEGER     NOT NULL DEFAULT 0,
  -- 'system' | 'admin' | 'cron' | 'manual'
  triggered_by     TEXT        NOT NULL DEFAULT 'system',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_jobs_store_id   ON scrape_jobs(store_id);
CREATE INDEX idx_scrape_jobs_status     ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_created_at ON scrape_jobs(created_at);

-- =============================================================
-- SCRAPE LOGS
-- =============================================================
CREATE TABLE scrape_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID        NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
  level      TEXT        NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message    TEXT        NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_logs_job_id     ON scrape_logs(job_id);
CREATE INDEX idx_scrape_logs_level      ON scrape_logs(level);
CREATE INDEX idx_scrape_logs_created_at ON scrape_logs(created_at);

-- =============================================================
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at column on row changes.
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_prices_updated_at
  BEFORE UPDATE ON prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
