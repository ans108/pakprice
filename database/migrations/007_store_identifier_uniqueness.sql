-- =============================================================
-- PakPrice: Migration 007 — Store Identifier Uniqueness (Phase 5B)
-- =============================================================
-- Adds a unique constraint ensuring that one identifier at one store
-- can only point to one variant. Without this, the same store URL slug
-- or product_id could silently map to multiple variants.
--
-- Pre-flight verified: 0 conflicts in production data (197 rows).
--
-- Existing constraint: UNIQUE(variant_id, store_id, identifier_type)
--   → prevents duplicate identifier types per variant per store
--
-- New constraint: UNIQUE(store_id, identifier_type, identifier)
--   → prevents same identifier from pointing to multiple variants
-- =============================================================

ALTER TABLE store_product_identifiers
  ADD CONSTRAINT uq_store_identifier_unique
  UNIQUE (store_id, identifier_type, identifier);
