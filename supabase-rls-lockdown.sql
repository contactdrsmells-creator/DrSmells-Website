-- =====================================================================
-- Close public access to the database
-- =====================================================================
-- The anon key ships inside every page of the website, so it is public by
-- design. What stops a stranger using it is Row Level Security.
--
-- RLS alone is not enough. This database already carried policies such as
-- "Anon can read own order" (SELECT, to public, USING true) and "Admin
-- update products" (UPDATE, to public, USING true). Despite the names, they
-- check nothing and are granted to everyone, so simply enabling RLS left
-- customer records readable and prices rewritable. Policies combine with OR,
-- so one loose policy defeats every strict one beside it.
--
-- This script is therefore declarative: it removes every policy on the tables
-- it manages and recreates only the intended ones. Re-running it always
-- produces the same end state, whatever was there before.
--
-- The service role key used by the server routes bypasses RLS entirely, so
-- checkout, webhooks, the CRM sync and the admin panel keep working.
--
-- Run the whole file in the Supabase SQL editor (Dr Smells website project).
-- =====================================================================

DO $$
DECLARE
  t text;
  pol record;

  -- Private: no public access whatsoever. Nothing in the browser touches
  -- these; every read and write goes through a server route holding the
  -- service role key. They end up with zero policies, which denies everyone.
  private_tables text[] := ARRAY['orders', 'vouchers', 'reviews', 'admin_users'];

  -- Content: the storefront renders these, so the public may read them and
  -- nothing more. Writes go through /api/admin/content, which checks the
  -- admin session and limits each role to the fields it may change.
  content_tables text[] := ARRAY['products', 'faqs', 'testimonials', 'hero_banners'];

  all_tables text[] := private_tables || content_tables || ARRAY['site_settings'];
BEGIN
  -- Clear the slate. Anything not recreated below is gone for good.
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped % (table does not exist)', t;
      CONTINUE;
    END IF;

    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'dropped policy "%" on %', pol.policyname, t;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  -- Private tables get nothing back.
  FOREACH t IN ARRAY private_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      RAISE NOTICE 'locked % — no public access', t;
    END IF;
  END LOOP;

  -- Content tables get read, and only read.
  FOREACH t IN ARRAY content_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format(
      'CREATE POLICY "public read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    RAISE NOTICE 'locked % — public may read only', t;
  END LOOP;

  -- site_settings also holds the WhatsApp automation row, which contains the
  -- Strive Flowbuilder key, so the readable keys are named explicitly. A
  -- settings row added later is private unless it is deliberately added here.
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    CREATE POLICY "public read site settings" ON public.site_settings
      FOR SELECT TO anon, authenticated
      USING (key IN ('brand', 'contact', 'social', 'site_images', 'shipping', 'payment'));
    RAISE NOTICE 'locked site_settings — public may read display keys only';
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- Verify. Expected end state:
--   orders, vouchers, reviews, admin_users ... rls = true, 0 policies
--   products, faqs, testimonials, banners .... rls = true, 1 policy (SELECT)
--   site_settings ............................ rls = true, 1 policy (SELECT)
-- Any row showing rls_enabled = false, or a policy granting INSERT/UPDATE/
-- DELETE to anon or public, means something is still open.
-- ---------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COALESCE(p.policy_count, 0) AS policies,
  COALESCE(p.public_writes, 0) AS public_write_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT
    tablename,
    COUNT(*) AS policy_count,
    COUNT(*) FILTER (WHERE cmd <> 'SELECT') AS public_writes
  FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
) p ON p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity, COALESCE(p.public_writes, 0) DESC, c.relname;
