import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";

/**
 * Admin-only check that the database is actually closed to the public.
 *
 * It re-runs the attacks against the live database using the same public key
 * that ships in the website's JavaScript, so the result reflects what a
 * stranger can really do — not what the config is supposed to say.
 *
 * Nothing is written. The write probe deliberately sends an empty row: if RLS
 * is blocking, Postgres refuses on permission; if it is not, it refuses on the
 * missing NOT NULL column instead. Either way the insert never lands, and the
 * two errors tell the two cases apart.
 */
const PRIVATE_TABLES = ["orders", "vouchers", "reviews", "admin_users"];
const CONTENT_TABLES = ["products", "faqs", "testimonials", "hero_banners"];

const PERMISSION_DENIED = "42501";

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  // The key a visitor has. Not the service role — that is the point.
  const publicClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const results: Record<string, unknown>[] = [];

  // Can a stranger read customer data?
  for (const table of PRIVATE_TABLES) {
    const { data, error } = await publicClient.from(table).select("*").limit(1);
    const rows = data?.length ?? 0;
    results.push({
      check: `public can read ${table}`,
      exposed: rows > 0,
      rows_returned: rows,
      detail: error ? error.message : rows > 0 ? "READABLE BY ANYONE" : "no rows returned",
    });
  }

  // Can a stranger rewrite prices or content?
  for (const table of [...CONTENT_TABLES, "site_settings"]) {
    const { error } = await publicClient.from(table).insert({});
    const blocked = error?.code === PERMISSION_DENIED;
    results.push({
      check: `public can write ${table}`,
      exposed: !blocked,
      detail: blocked
        ? "blocked by row level security"
        : `NOT BLOCKED — database rejected it for another reason (${error?.code ?? "no error"}: ${error?.message ?? "insert succeeded"})`,
    });
  }

  // Can a stranger read the WhatsApp webhook key out of settings?
  const { data: secretRow } = await publicClient
    .from("site_settings")
    .select("key")
    .eq("key", "whatsapp_automation");
  results.push({
    check: "public can read the WhatsApp automation key",
    exposed: (secretRow?.length ?? 0) > 0,
    detail: secretRow?.length ? "SETTINGS SECRET IS READABLE" : "hidden",
  });

  const exposures = results.filter((r) => r.exposed);

  return Response.json({
    service_role_key_configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    secure: exposures.length === 0,
    exposures: exposures.length,
    summary: exposures.length
      ? "Public access is still open — run supabase-rls-lockdown.sql"
      : "No public access. Customer data and prices are protected.",
    results,
  });
}
