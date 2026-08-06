-- =====================================================================
-- Let the storefront read the promo / WhatsApp widget settings
-- =====================================================================
-- site_settings is readable only for the keys named in its policy, so that a
-- row holding a credential — the WhatsApp automation key, for instance — can
-- never be served to a visitor. A new "promo" row therefore has to be added to
-- that list explicitly before the header button can read it.
--
-- The row holds the header promo pill (enabled, label, link) and the floating
-- WhatsApp button (enabled, url). Nothing secret.
--
-- Run in the Supabase SQL editor for the website project. Safe to re-run.
-- =====================================================================

DROP POLICY IF EXISTS "public read site settings" ON site_settings;

CREATE POLICY "public read site settings" ON site_settings
  FOR SELECT TO anon, authenticated
  USING (key IN (
    'brand', 'contact', 'social', 'site_images', 'shipping', 'payment', 'promo'
  ));

-- Verify: the policy should list 'promo'.
SELECT policyname, qual::text AS using_condition
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'site_settings';
