-- =====================================================================
-- Payment status re-check tracking
-- =====================================================================
-- A DOKU notification does not always arrive. Order 120WWV was approved on
-- card at DOKU and never reached the website, so it sat pending until someone
-- noticed it in DOKU's dashboard — and until it was corrected by hand it was
-- never packed.
--
-- The scheduled job asks DOKU directly whether a pending order was in fact
-- paid. These two columns bound that: how many times an order has been asked
-- about, and when it was last asked. Checks follow a widening schedule and stop
-- after the last one, so no order is polled indefinitely.
--
-- Run in the Supabase SQL editor for the website project. Safe to re-run.
-- =====================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_check_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_checked_at  TIMESTAMPTZ;

-- The job filters on unpaid, recent orders; this keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS orders_payment_check_idx
  ON orders (created_at DESC)
  WHERE payment_status <> 'paid';

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('payment_check_count', 'payment_checked_at');
