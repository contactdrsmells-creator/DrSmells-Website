import { cookies } from "next/headers";

/**
 * Admin-only, READ-ONLY audit of live Stripe subscriptions.
 *
 * Cancelling a subscription in WooCommerce does not necessarily cancel the
 * underlying Stripe subscription — Woo's status is Woo's own. Any subscription
 * still active here will keep billing on Stripe's schedule no matter what the
 * old site said, which is how a "cancelled" customer gets charged.
 *
 * This lists what Stripe still considers billable so it can be reconciled
 * against what should have been cancelled. It deliberately performs no
 * mutations: cancelling stops a customer's billing and is not something to
 * automate from a diagnostic.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!cookieStore.get("admin_token")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeSecretKey);

  const { searchParams } = new URL(request.url);
  // Anything Stripe will still attempt to bill.
  const status = (searchParams.get("status") || "active") as "active" | "past_due" | "paused" | "trialing" | "all";

  try {
    const subs = await stripe.subscriptions.list({
      status,
      limit: 100,
      expand: ["data.customer"],
    });

    const rows = subs.data.map((sub) => {
      const customer = sub.customer as { email?: string; name?: string } | string;
      const amount = sub.items.data.reduce(
        (sum, i) => sum + (i.price?.unit_amount ?? 0) * (i.quantity ?? 1),
        0,
      ) / 100;

      return {
        subscription_id: sub.id,
        status: sub.status,
        customer_email: typeof customer === "object" ? customer.email ?? null : null,
        customer_name: typeof customer === "object" ? customer.name ?? null : null,
        amount_per_cycle: amount,
        currency: sub.currency?.toUpperCase(),
        created: new Date(sub.created * 1000).toISOString().slice(0, 10),
        cancel_at_period_end: sub.cancel_at_period_end,
        paused: !!sub.pause_collection,
        pause_resumes_at: sub.pause_collection?.resumes_at
          ? new Date(sub.pause_collection.resumes_at * 1000).toISOString().slice(0, 10)
          : null,
        // Subscriptions created by this website carry order_number metadata.
        // Anything without it predates the migration — i.e. an old Woo record.
        order_number: sub.metadata?.order_number ?? null,
        origin: sub.metadata?.order_number ? "new website" : "pre-migration (old site)",
      };
    });

    const fromOldSite = rows.filter((r) => r.origin !== "new website");

    return Response.json({
      queried_status: status,
      note:
        "These are subscriptions Stripe still considers billable. Anything marked 'pre-migration' was not created by the new website — if it should have been cancelled, it must be cancelled in Stripe, since cancelling in WooCommerce does not stop Stripe billing.",
      total: rows.length,
      pre_migration_count: fromOldSite.length,
      total_billing_per_cycle: rows.reduce((s, r) => s + r.amount_per_cycle, 0),
      subscriptions: rows,
      has_more: subs.has_more,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
