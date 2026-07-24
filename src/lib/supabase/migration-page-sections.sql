-- Run this in Supabase SQL Editor to add per-product page sections
ALTER TABLE products ADD COLUMN IF NOT EXISTS page_sections JSONB DEFAULT '{}';
