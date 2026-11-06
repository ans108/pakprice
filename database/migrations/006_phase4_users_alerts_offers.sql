-- =============================================================
-- PakPrice: Migration 006 — Phase 4: Users, Alerts & Offers
-- =============================================================
-- Run AFTER migrations 001–005.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds missing columns to coupons and bank_offers with explicit numeric types
--   2. Adds composite index on price_history for efficient range queries
--   3. Adds partial index on price_alerts for fast active alert evaluation
--   4. Creates auto-profile trigger on auth.users signup with SECURITY DEFINER
--      and explicit search_path = public
--
-- All additions are non-breaking and idempotent where practical.
-- Does NOT modify migrations 001–005.
-- =============================================================

-- =============================================================
-- SECTION 1: SCHEMA ADDITIONS
-- =============================================================

-- ── coupons: additional fields ──────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(12,2) CHECK (max_discount IS NULL OR max_discount >= 0),
  ADD COLUMN IF NOT EXISTS url TEXT CHECK (url IS NULL OR url ~* '^https?://');

-- ── bank_offers: additional fields ──────────────────────────
ALTER TABLE bank_offers
  ADD COLUMN IF NOT EXISTS min_purchase NUMERIC(12,2) CHECK (min_purchase IS NULL OR min_purchase >= 0),
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(12,2) CHECK (max_discount IS NULL OR max_discount >= 0);

-- =============================================================
-- SECTION 2: INDEXES
-- =============================================================

-- Composite index for efficient price history range queries
-- Supports: WHERE variant_id = ? AND store_id = ? ORDER BY scraped_at DESC
CREATE INDEX IF NOT EXISTS idx_price_history_variant_store_scraped
  ON price_history(variant_id, store_id, scraped_at DESC);

-- Partial index for active untriggered alerts during ingestion evaluation
CREATE INDEX IF NOT EXISTS idx_price_alerts_active_untriggered
  ON price_alerts(variant_id, target_price)
  WHERE is_active = true AND triggered_at IS NULL;

-- =============================================================
-- SECTION 3: AUTO-PROFILE TRIGGER
-- =============================================================
-- Automatically creates a user_profiles row when a new user signs up
-- via Supabase Auth.
-- Requirements:
--   • SECURITY DEFINER
--   • fixed search_path = public
--   • schema-qualified write to public.user_profiles
--   • ON CONFLICT (id) DO NOTHING
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- END OF MIGRATION 006
-- =============================================================
