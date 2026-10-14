import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";

/**
 * The member's standing subscriptions, and when each is next charged.
 *
 * What the orders table holds is the subscription as it was on the day it was
 * bought. Whether it is still running, and when the next delivery is due, is
 * Stripe's to answer — a subscription cancelled last month still has a
 * perfectly good order row behind it, and showing that as live would promise a
 * customer a parcel that is never coming.
 *
 * So Stripe is asked, and what it says wins. Where it cannot be reached the
 * order is still shown, marked as unconfirmed rather than silently dropped:
 * somebody who is paying every month should see that we know about it even on
 * a day our billing provider is unreachable.
 *
 * Read-only. Cancelling stops a customer's billing and is not something to do
 * from a page that was only asked to display.
 */

interface SubscriptionItem {
  product_name?: string;
  variation?: string;
  quantity?: number;
  subscription?: { interval_months: number; price: number } | null;
}

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ subscriptions: [] }, { status: 401 });

  const db = supabaseAdmin();

  const { data: orders } = await db
    .from("orders")
    .select("order_number, items, total, created_at, stripe_subscription_id, payment_status")
    .eq("customer_id", session.id)
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: false });

  // One entry per subscription, built from the order that started it. A
  // renewal creates its own order against the same Stripe id, and listing
  // those as separate subscriptions would tell a customer they had signed up
  // four times.
  type SubOrder = NonNullable<typeof orders>[number];
  const started = new Map<string, SubOrder>();
  for (const order of orders || []) {
    const id = order.stripe_subscription_id as string;
    if (!started.has(id)) started.set(id, order);
    else {
      const first = started.get(id)!;
      if (new Date(order.created_at) < new Date(first.created_at)) started.set(id, order);
    }
  }
  if (!started.size) return Response.json({ subscriptions: [] });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let stripe: import("stripe").default | null = null;
  if (stripeKey) {
    const Stripe = (await import("stripe")).default;
    stripe = new Stripe(stripeKey);
  }

  const subscriptions = [];
  for (const [id, order] of started) {
    const items = (Array.isArray(order.items) ? order.items : []) as SubscriptionItem[];
    const lines = items
      .filter((item) => item.subscription)
      .map((item) => ({
        name: item.product_name || "Item",
        variation: item.variation || null,
        quantity: item.quantity || 1,
        interval_months: item.subscription?.interval_months ?? null,
        price: item.subscription?.price ?? null,
      }));

    let status: string | null = null;
    let nextCharge: string | null = null;
    let amount: number | null = null;

    if (stripe) {
      try {
        const live = await stripe.subscriptions.retrieve(id);
        status = live.status;
        // Stripe reports this per item on newer API versions; the subscription
        // level is kept for anything created before that.
        const period =
          (live as unknown as { current_period_end?: number }).current_period_end ??
          live.items?.data?.[0]?.current_period_end ??
          null;
        nextCharge = period ? new Date(period * 1000).toISOString() : null;
        amount =
          live.items.data.reduce(
            (sum, i) => sum + (i.price?.unit_amount ?? 0) * (i.quantity ?? 1),
            0,
          ) / 100;
      } catch (err) {
        // A subscription Stripe no longer knows about, or an outage. Either
        // way the customer's own record of it still stands.
        console.error(`[Subscriptions] Could not read ${id}:`, (err as Error).message);
      }
    }

    subscriptions.push({
      id,
      order_number: order.order_number,
      started_at: order.created_at,
      status,
      next_charge: nextCharge,
      amount: amount ?? (Number(order.total) || null),
      items: lines,
      /** How many orders this subscription has produced, including the first. */
      deliveries: (orders || []).filter((o) => o.stripe_subscription_id === id).length,
    });
  }

  // Live ones first — a cancelled subscription is history, not a standing
  // arrangement, and should not be the first thing read.
  const live = (s: { status: string | null }) =>
    s.status === "active" || s.status === "trialing" || s.status === "past_due" || s.status === null;
  subscriptions.sort((a, b) => Number(live(b)) - Number(live(a)));

  return Response.json({ subscriptions });
}
