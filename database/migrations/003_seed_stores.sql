-- =============================================================
-- PakPrice: Migration 003 — Seed Stores
-- =============================================================
-- Run AFTER 001_initial_schema.sql
--
-- Seeds the 12 Pakistani stores tracked by PakPrice.
-- logo_url is NULL for all stores in Phase 1.
-- Logos will be added in a later phase when the scraper
-- downloads and hosts them.
-- =============================================================

INSERT INTO stores (name, slug, base_url, logo_url, scraper_key, is_active, sort_order)
VALUES
  ('Daraz',        'daraz',        'https://www.daraz.pk',          NULL, 'daraz',        true,  1),
  ('PriceOye',     'priceoye',     'https://priceoye.pk',           NULL, 'priceoye',     true,  2),
  ('Mega.pk',      'mega-pk',      'https://www.mega.pk',           NULL, 'mega_pk',      true,  3),
  ('Telemart',     'telemart',     'https://www.telemart.pk',       NULL, 'telemart',     true,  4),
  ('Shophive',     'shophive',     'https://www.shophive.com',      NULL, 'shophive',     true,  5),
  ('HomeShopping', 'homeshopping', 'https://www.homeshopping.pk',   NULL, 'homeshopping', true,  6),
  ('Paklap',       'paklap',       'https://www.paklap.pk',         NULL, 'paklap',       true,  7),
  ('iShopping',    'ishopping',    'https://www.ishopping.pk',      NULL, 'ishopping',    true,  8),
  ('Metro',        'metro',        'https://www.metro.pk',          NULL, 'metro',        true,  9),
  ('Carrefour',    'carrefour',    'https://www.carrefour.pk',      NULL, 'carrefour',    true, 10),
  ('Naheed',       'naheed',       'https://www.naheed.pk',         NULL, 'naheed',       true, 11),
  ('Al-Fatah',     'al-fatah',     'https://www.alfatah.com.pk',    NULL, 'al_fatah',     true, 12);
