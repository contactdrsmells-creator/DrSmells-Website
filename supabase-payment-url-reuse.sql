-- =====================================================================
-- Remember when a payment link was created
-- =====================================================================
-- /pay/<order> mints a fresh DOKU checkout on every visit, which is what keeps
-- the link working however long a reminder sits unread. The cost is that each
-- tap registers another pending transaction at DOKU: opening the same link
-- twice a minute apart produced two.
--
-- With a timestamp on the link, a repeat visit within a few minutes can reuse
-- the checkout already created instead of making another one.
--
-- Run in the Supabase SQL editor for the website project. Safe to re-run.
-- =====================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_url_created_at TIMESTAMPTZ;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'payment_url_created_at';
