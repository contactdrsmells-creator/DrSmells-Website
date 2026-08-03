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
-- Tables that do not exist yet are skipped rather than aborting the run, so
-- this can never leave half the database locked and half of it open.
--
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- =====================================================================

DO $$
DECLARE
  t text;

  -- 1. Private: no public access at all. Nothing in the browser touches
  --    these; every read and write goes through a server route holding the
  --    service role key. No policy is created, which means deny everything.
  private_tables text[] := ARRAY['orders', 'vouchers', 'reviews', 'admin_users'];

  -- 2. Content: public may read, nobody public may write. The storefront
  --    renders these, so anonymous SELECT stays. Writes now go through
  --    /api/admin/content, which checks the admin session.
  content_tables text[] := ARRAY['products', 'faqs', 'testimonials', 'hero_banners'];
BEGIN
  FOREACH t IN ARRAY private_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped % (table does not exist)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'locked % (private)', t;
  END LOOP;

  FOREACH t IN ARRAY content_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped % (table does not exist)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "public read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "public read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    RAISE NOTICE 'locked % (read-only for public)', t;
  END LOOP;

  -- 3. site_settings: public may read only the rows the website displays.
  --    This table also holds the WhatsApp automation row, which contains the
  --    Strive Flowbuilder key. Listing the readable keys explicitly means a
  --    future settings row is private unless deliberately added here.
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "public read site settings" ON public.site_settings;
    CREATE POLICY "public read site settings" ON public.site_settings
      FOR SELECT TO anon, authenticated
      USING (key IN ('brand', 'contact', 'social', 'site_images', 'shipping', 'payment'));
    RAISE NOTICE 'locked site_settings (public keys readable only)';
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- Verify: every table should report rls_enabled = true.
-- Anything listed with rls_enabled = false is still open to the public.
-- ---------------------------------------------------------------------
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
