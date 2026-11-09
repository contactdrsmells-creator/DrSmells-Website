import { timingSafeEqual } from "crypto";
import { normalisePhone, supabaseAdmin } from "@/lib/customer-auth";
import { awardForOrders, crmOrderEarns, getLedger, lifetimeEarnedFrom } from "@/lib/points";
import { getTiers, multiplierFor } from "@/lib/tiers";

/**
 * Points for an order the CRM has just completed.
 *
 * The account page already sweeps a member's chat orders when they open it,
 * which is enough for the customer but not for the shop: until that customer
 * next signs in, the CRM's own list shows a balance that has not moved, and
 * whoever is answering them has no way to tell whether the points are there.
 * Somebody completing an order in the CRM expects the number beside that
 * customer to change, not to change the next time the customer happens to log
 * in.
 *
 * So the CRM pushes, this awards, and the CRM reads the balance back live.
 * One ledger either way — the sweep and this door award through the same
 * function, keyed on the order number, so whichever gets there first wins and
 * the other finds the work done.
 *
 * Behind the shared secret the two systems already use between them.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.CRM_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!secretMatches(request.headers.get("x-webhook-secret"), expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const orderNumber = String(body?.order_number || "").trim();
  const phone = normalisePhone(String(body?.phone || ""));
  if (!orderNumber || !phone) {
    return Response.json({ error: "A phone number and an order number are required" }, { status: 400 });
  }

  // The same rule the account-page sweep applies, so an order cannot earn
  // through one door what it is refused at the other.
  if (!crmOrderEarns(body)) {
    return Response.json({ awarded: 0, reason: "not an earning order" });
  }

  const db = supabaseAdmin();

  // Matched on the phone number, which is the only thing the two systems
  // agree on about a person — the CRM has no idea an account exists.
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  // No account is an ordinary answer, not a failure: most people who buy over
  // chat have never signed up, and nothing can be credited to nobody.
  if (!customer) return Response.json({ awarded: 0, reason: "no shop account" });

  const [ledger, tiers] = await Promise.all([getLedger(db, customer.id), getTiers(db)]);
  const result = await awardForOrders(db, {
    customerId: customer.id,
    multiplier: multiplierFor(lifetimeEarnedFrom(ledger), tiers),
    orders: [{ orderNumber, spend: Number(body.amount) }],
  });

  return Response.json({ awarded: result.awarded, orders: result.orders });
}
