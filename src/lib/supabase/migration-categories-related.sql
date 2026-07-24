-- Add categories array and related_products to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS related_products JSONB DEFAULT '[]';

-- Backfill categories from existing category column
UPDATE products SET categories = jsonb_build_array(category) WHERE categories = '[]' AND category IS NOT NULL;
