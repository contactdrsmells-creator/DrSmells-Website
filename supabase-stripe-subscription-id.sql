-- Adds the missing stripe_subscription_id column and repairs orders it broke.
--
-- The Stripe webhook writes this field when a checkout creates a subscription.
-- Postgres rejects an entire UPDATE if any column is unknown, so on a table
-- without it the status change was discarded too — subscription orders stayed
-- at "pending" while the money had arrived. A later invoice.paid event set
-- payment_status on its own, producing orders that read paid-but-pending.
--
-- The code now writes the optional field separately so this cannot recur, but
-- the column is still wanted: it links an order to its Stripe subscription for
-- cancellations and renewals.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Repair the affected orders: payment confirmed, status never updated.
UPDATE orders
   SET status = 'paid',
       updated_at = now()
 WHERE payment_status = 'paid'
   AND status = 'pending';
