import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";
import { awardForOrders, getBalance, getHistory, getRules } from "@/lib/points";

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

  const { data: orders } = await db
    .from("orders")
    .select("order_number, status, payment_status, total, items, created_at")
    .eq("customer_id", session.id)
    .order("created_at", { ascending: false })
    .limit(50);

  await awardForOrders(db, {
    customerId: session.id,
    orders: (orders || [])
      .filter((order) => order.payment_status === "paid")
      .map((order) => ({ orderNumber: order.order_number, spend: Number(order.total || 0) })),
  });

  const [balance, history, rules] = await Promise.all([
    getBalance(db, session.id),
    getHistory(db, session.id),
    getRules(db),
  ]);

  return Response.json({
    customer: session,
    balance,
    value: rules.points_per_ringgit ? Math.round((balance / rules.points_per_ringgit) * 100) / 100 : 0,
    history,
    rules,
    orders: orders || [],
  });
}
