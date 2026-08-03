import { requirePermission } from "@/lib/admin-auth";

/**
 * Admin-only. Identifies which Stripe key THIS site uses, so the old site's key
 * can be revoked without accidentally killing checkout here.
 *
 * Returns the key's mode and last 4 characters only — enough to match against
 * the Stripe dashboard's API keys list, which displays the same last 4. The key
 * itself is never returned.
 */
export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 });
  }

  // Plain fetch: the SDK's accounts.retrieve() requires an account id, whereas
  // GET /v1/account returns whichever account the key itself belongs to — which
  // is exactly what needs confirming here.
  let account: Record<string, unknown> = {};
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    account = res.ok
      ? { id: data.id, email: data.email ?? null, business_name: data.business_profile?.name ?? null }
      : { error: data?.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    account = { error: err instanceof Error ? err.message : String(err) };
  }

  return Response.json({
    warning: "Do NOT revoke this key — it is the one this website uses for checkout.",
    mode: key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test",
    key_last4: key.slice(-4),
    stripe_account: account,
    how_to_use:
      "In Stripe > Developers > API keys, find the key ending in these 4 characters. That one must stay. Any OTHER live secret key with recent activity is what the old site is charging with.",
  });
}
