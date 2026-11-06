-- =============================================================
-- PakPrice: Migration 008 — Performance & Deterministic Pagination Indexes
-- =============================================================
-- Run AFTER migrations 001–007.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds composite indexes on user-scoped tables for deterministic
--      pagination and index-supported ordering:
--      (user_id, created_at DESC, id DESC)
--   2. Adds composite indexes on active offers/coupons for fast range/filtering
--      and deterministic sorting:
--      (is_active, valid_until, created_at DESC, id DESC)
--
-- All additions use IF NOT EXISTS — idempotent, non-blocking, and non-destructive.
-- Does NOT modify existing data or prior migrations.
-- =============================================================

-- Deterministic ordering for user favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user_created_id
  ON favorites(user_id, created_at DESC, id DESC);

-- Deterministic ordering for user price alerts
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_created_id
  ON price_alerts(user_id, created_at DESC, id DESC);

-- Deterministic ordering for search history
CREATE INDEX IF NOT EXISTS idx_search_history_user_created_id
  ON search_history(user_id, created_at DESC, id DESC);

-- Deterministic ordering & active filtering for coupons
CREATE INDEX IF NOT EXISTS idx_coupons_active_valid_created
  ON coupons(is_active, valid_until, created_at DESC, id DESC);

-- Deterministic ordering & active filtering for bank offers
CREATE INDEX IF NOT EXISTS idx_bank_offers_active_valid_created
  ON bank_offers(is_active, valid_until, created_at DESC, id DESC);
