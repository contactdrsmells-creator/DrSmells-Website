-- =====================================================================
-- Close public access to the database
-- =====================================================================
-- The anon key ships inside every page of the website, so it is public by
-- design. Without Row Level Security, that key could read and write every
-- table — customer records were downloadable, and product prices (which
-- checkout trusts when verifying totals) were rewritable by anyone.
--
-- This turns RLS on everywhere and grants the public key nothing except
-- reading the content the storefront actually renders.
--
-- The service role key used by the server routes bypasses RLS entirely, so
-- checkout, webhooks, the CRM sync and the admin panel are unaffected.
--
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Private tables — no public access at all.
--    Nothing in the browser touches these; every read and write goes
--    through a server route holding the service role key.
-- ---------------------------------------------------------------------
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- No policies are created for these, which means: deny everything.


-- ---------------------------------------------------------------------
-- 2. Content tables — public may read, nobody public may write.
--    The storefront renders these, so anonymous SELECT stays. Writes now
--    go through /api/admin/content, which checks the admin session.
-- ---------------------------------------------------------------------
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_banners  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read products"     ON products;
DROP POLICY IF EXISTS "public read faqs"         ON faqs;
DROP POLICY IF EXISTS "public read testimonials" ON testimonials;
DROP POLICY IF EXISTS "public read banners"      ON hero_banners;

CREATE POLICY "public read products"     ON products     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read faqs"         ON faqs         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read banners"      ON hero_banners FOR SELECT TO anon, authenticated USING (true);


-- ---------------------------------------------------------------------
-- 3. site_settings — public may read only the rows the website displays.
--    This table also holds the WhatsApp automation row, which contains the
--    Strive Flowbuilder key. Listing the readable keys explicitly means a
--    future settings row is private unless it is deliberately added here.
-- ---------------------------------------------------------------------
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read site settings" ON site_settings;

CREATE POLICY "public read site settings" ON site_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('brand', 'contact', 'social', 'site_images', 'shipping', 'payment'));


-- ---------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------
-- Every table below should report rls_enabled = true.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COALESCE(p.policy_count, 0) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT tablename, COUNT(*) AS policy_count
  FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
) p ON p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;
