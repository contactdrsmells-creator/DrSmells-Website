-- Add multi-attribute variation columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS variation_attributes JSONB DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variation_combos JSONB DEFAULT NULL;
