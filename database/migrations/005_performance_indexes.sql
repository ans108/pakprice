-- Add pg_trgm index to normalized_name to avoid full table scans during search
CREATE INDEX IF NOT EXISTS idx_products_normalized_name_trgm ON products USING gin(normalized_name gin_trgm_ops);
