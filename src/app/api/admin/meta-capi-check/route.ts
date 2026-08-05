import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";
import { META_PIXEL_ID, postPurchase } from "@/lib/meta-capi";

/**
 * Admin-only Conversions API check.
 *
 * Reports what is actually configured and how many recent sales reached Meta,
 * rather than asserting that the setup is correct. The coverage figure is the
 * one that matters: it is the direct answer to "is Ads Manager seeing my
 * orders", which nothing else on either dashboard can tell you.
 *
 * Never returns the access token.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const hasToken = !!process.env.META_CAPI_ACCESS_TOKEN;
  const supabase = getSupabase();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: paidOrders, error } = await supabase
    .from("orders")
    .select("order_number, total, source, meta_capi_sent_at, meta_attribution, updated_at")
    .eq("payment_status", "paid")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });

  if (error) {
    // The most likely cause by far is the migration not having been run.
    return Response.json({
      pixel_id: META_PIXEL_ID,
      access_token_set: hasToken,
      migration_applied: false,
      error: error.message,
      hint: "Run supabase-meta-capi.sql in the Supabase SQL Editor.",
    });
  }

  const orders = paidOrders || [];
  const reported = orders.filter((o) => o.meta_capi_sent_at);
  const withClickId = orders.filter((o) => o.meta_attribution?.fbc);

  return Response.json({
    pixel_id: META_PIXEL_ID,
    access_token_set: hasToken,
    migration_applied: true,
    window: "last 7 days",
    paid_orders: orders.length,
    reported_to_meta: reported.length,
    carrying_ad_click_id: withClickId.length,
    unreported: orders
      .filter((o) => !o.meta_capi_sent_at)
      .map((o) => ({ order: o.order_number, total: o.total, source: o.source, paid_at: o.updated_at })),
    hint: hasToken
      ? undefined
      : "META_CAPI_ACCESS_TOKEN is not set — nothing is being reported. Add it in Vercel → Settings → Environment Variables.",
  });
}

/**
 * Sends one real order to Meta again, tagged with a test event code so it lands
 * in Events Manager → Test events instead of live reporting.
 *
 * Takes a test_event_code from Events Manager and an order number to replay.
 */
export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const orderNumber = typeof body.order_number === "string" ? body.order_number.trim() : "";
  const testEventCode = typeof body.test_event_code === "string" ? body.test_event_code.trim() : "";

  if (!orderNumber) return Response.json({ error: "order_number is required" }, { status: 400 });
  if (!testEventCode) {
    return Response.json(
      { error: "test_event_code is required, so a check cannot be mistaken for a real sale" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total, items, shipping, payment_status, meta_attribution, updated_at")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const result = await postPurchase(order, testEventCode);
  return Response.json({ order: orderNumber, ...result });
}
