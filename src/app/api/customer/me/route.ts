import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";
import {
  awardForOrders, balanceFrom, CANCELLED, getHistory, getLedger, getRules, lifetimeEarnedFrom,
  reverseForCancelled,
} from "@/lib/points";
import { getTiers, standingFor, multiplierFor } from "@/lib/tiers";

/**
 * The account's own view of itself: who it is, what it has, and why.
 *
 * Paid orders are swept for points as this loads rather than points being
 * awarded from each of the seven places an order can be marked paid. Awarding
 * is keyed on the order number and so cannot pay twice, which makes a sweep
 * safe to run as often as the page is opened — and means a missed webhook
 * costs a customer nothing.
 *
 * The sweep is two queries for any number of orders, and everything here talks
 * only to our own database. What a customer bought over chat lives in the CRM,
 * and fetching it used to happen here too — a page that could not show a
 * balance until a second system had answered, which took three to five seconds
 * to display a number we already held. That now has an endpoint of its own,
 * called after this one has painted.
 */
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ customer: null }, { status: 401 });

  const db = supabaseAdmin();

  // Everything the page needs that does not depend on anything else, at once.
  const [{ data: orders }, ledger, tiers, rules] = await Promise.all([
    db
      .from("orders")
      .select("order_number, status, payment_status, total, subtotal, shipping_cost, discount, voucher_code, items, shipping, stripe_subscription_id, created_at")
      .eq("customer_id", session.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getLedger(db, session.id),
    getTiers(db),
    getRules(db),
  ]);

  // The tier is read before awarding, so the rate applied is the one they had
  // when the order was placed rather than one the award itself just unlocked.
  const earnedBefore = lifetimeEarnedFrom(ledger);
  const award = await awardForOrders(db, {
    customerId: session.id,
    multiplier: multiplierFor(earnedBefore, tiers),
    orders: (orders || [])
      .filter((order) => order.payment_status === "paid")
      .map((order) => ({ orderNumber: order.order_number, spend: Number(order.total || 0) })),
  });

  // And points taken back for an order that has since been cancelled or
  // refunded. The reversal was written long ago and nothing ever called it, so
  // a cancelled order kept its points for ever — somebody could order, be
  // credited, cancel, and spend the points on the next thing.
  //
  // Checked here, beside the award, because the two have to agree: points
  // appear when the customer opens their account, and they can only spend them
  // while signed in, so this runs before any redemption can.
  const reversed = await reverseForCancelled(
    db,
    (orders || [])
      .filter((order) => CANCELLED.has(String(order.payment_status)) || CANCELLED.has(String(order.status)))
      .map((order) => order.order_number),
  );

  // Re-read only when the sweep actually changed something, which it almost
  // never does — the common case is one query, not two.
  const rows = award.awarded || reversed ? await getLedger(db, session.id) : ledger;
  const balance = balanceFrom(rows);
  const standing = standingFor(lifetimeEarnedFrom(rows), tiers);

  return Response.json({
    customer: session,
    balance,
    value: rules.points_per_ringgit ? Math.round((balance / rules.points_per_ringgit) * 100) / 100 : 0,
    history: await getHistory(db, session.id),
    rules,
    tier: standing,
    tiers,
    orders: orders || [],
  });
}
