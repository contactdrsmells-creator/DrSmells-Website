-- Columns for the automated WhatsApp reminder on unpaid orders.
--
-- reminder_sent_at doubles as the idempotency guard: the cron job claims an
-- order by setting it before sending, so overlapping runs cannot message the
-- same customer twice. It is reset to NULL if the send fails.
--
-- payment_url stores the DOKU checkout link so the reminder can send the
-- customer straight back to paying. DOKU expires these after 24 hours.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_url text;

-- Keeps the hourly lookup cheap as the orders table grows.
CREATE INDEX IF NOT EXISTS orders_reminder_lookup_idx
  ON orders (status, created_at)
  WHERE reminder_sent_at IS NULL;
