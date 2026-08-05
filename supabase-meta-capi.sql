-- Meta Conversions API support.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Safe to re-run.

-- The click identifiers and browser details Meta needs to match a purchase to
-- the ad that caused it. Captured at checkout, while the customer is on the
-- site — by the time a payment webhook fires, the request belongs to DOKU's
-- server and the customer's IP, user agent and cookies are long gone.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_attribution jsonb;

-- Set once, when the Purchase event has been accepted by Meta. Claimed with a
-- conditional UPDATE so two payment paths firing at once (a late DOKU
-- notification racing the status-check cron) cannot report the same sale twice.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meta_capi_sent_at timestamptz;
