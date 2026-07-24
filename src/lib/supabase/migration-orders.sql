-- Orders table for payment gateway integration
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('senangpay', 'stripe', 'manual')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_reference TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  shipping JSONB NOT NULL DEFAULT '{}',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Payment settings in site_settings
-- Run this to add default payment settings:
INSERT INTO site_settings (key, value) VALUES ('payment', '{
  "senangpay_enabled": false,
  "stripe_enabled": false,
  "shipping_cost": "10.00",
  "free_shipping_threshold": "100.00",
  "currency": "MYR"
}')
ON CONFLICT (key) DO NOTHING;
