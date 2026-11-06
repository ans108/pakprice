-- =============================================================
-- PakPrice: Migration 002 — Row Level Security Policies
-- =============================================================
-- Run AFTER 001_initial_schema.sql
--
-- SECURITY MODEL:
--   • User-owned tables (user_profiles, favorites, search_history, price_alerts):
--     — Users can only read/write their OWN rows.
--     — The Supabase service-role key (used only by apps/api) bypasses RLS.
--     — The anon key (used by apps/web) is subject to RLS.
--     — NEVER expose the service-role key to the frontend.
--
--   • Public product/store data (categories, brands, products, product_variants,
--     stores, prices, price_history, coupons, bank_offers):
--     — Readable by anyone (anon + authenticated).
--     — Write access only via service-role (scraper / admin, Phase 3+).
--
--   • Scraping tables (scrape_jobs, scrape_logs, store_product_identifiers):
--     — Not exposed to the anon key at all in Phase 1.
-- =============================================================

-- ----------------------------------------------------------
-- Enable RLS on ALL tables
-- ----------------------------------------------------------

-- Public product/store tables
ALTER TABLE categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_offers               ENABLE ROW LEVEL SECURITY;

-- User-owned tables
ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts   ENABLE ROW LEVEL SECURITY;

-- Scraping infrastructure — no public access in Phase 1
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- PUBLIC READ POLICIES (anon + authenticated can read)
-- ----------------------------------------------------------

CREATE POLICY "categories_public_read"
  ON categories FOR SELECT USING (true);

CREATE POLICY "brands_public_read"
  ON brands FOR SELECT USING (true);

CREATE POLICY "products_public_read"
  ON products FOR SELECT USING (is_active = true);

CREATE POLICY "product_variants_public_read"
  ON product_variants FOR SELECT USING (is_active = true);

CREATE POLICY "stores_public_read"
  ON stores FOR SELECT USING (is_active = true);

CREATE POLICY "prices_public_read"
  ON prices FOR SELECT USING (true);

CREATE POLICY "price_history_public_read"
  ON price_history FOR SELECT USING (true);

CREATE POLICY "coupons_public_read"
  ON coupons FOR SELECT USING (is_active = true);

CREATE POLICY "bank_offers_public_read"
  ON bank_offers FOR SELECT USING (is_active = true);

-- store_product_identifiers: not exposed to public (scraper-internal use)
-- No SELECT policy = anon/authenticated cannot read this table

-- ----------------------------------------------------------
-- USER PROFILES — own rows only
-- ----------------------------------------------------------

CREATE POLICY "user_profiles_select_own"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles_insert_own"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_update_own"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "user_profiles_delete_own"
  ON user_profiles FOR DELETE
  USING (auth.uid() = id);

-- ----------------------------------------------------------
-- FAVORITES — own rows only
-- ----------------------------------------------------------

CREATE POLICY "favorites_select_own"
  ON favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "favorites_insert_own"
  ON favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_delete_own"
  ON favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------
-- SEARCH HISTORY — own rows only
-- ----------------------------------------------------------

CREATE POLICY "search_history_select_own"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "search_history_insert_own"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_history_delete_own"
  ON search_history FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------
-- PRICE ALERTS — own rows only
-- ----------------------------------------------------------

CREATE POLICY "price_alerts_select_own"
  ON price_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "price_alerts_insert_own"
  ON price_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "price_alerts_update_own"
  ON price_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "price_alerts_delete_own"
  ON price_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------
-- SCRAPE JOBS / LOGS — no direct public access
-- Service-role key bypasses RLS and has full access.
-- ----------------------------------------------------------
-- No policies defined = blocked for anon + authenticated roles.
-- Phase 3 admin panel will add admin-specific policies.
