-- Add variations column to products table
-- Each variation has: name (size label), price, sale_price
-- Example: [{"name": "30ml", "price": 49.90, "sale_price": null}, {"name": "50ml", "price": 59.90, "sale_price": null}]
ALTER TABLE products ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '[]';
