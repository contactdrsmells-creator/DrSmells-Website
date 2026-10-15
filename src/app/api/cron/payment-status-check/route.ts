import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getDokuPaymentStatus, isDokuStatusConfigured } from "@/lib/doku-status";
import { markOrderPaid } from "@/lib/mark-order-paid";

/**
 * Catches payments whose notification never arrived.
 *
 * DOKU approved order 120WWV on card and the callback never reached us, so the
 * order sat pending — invisible as a sale, and never packed, until it was
 * spotted by hand in DOKU's dashboard. Webhooks fail for all sorts of reasons;
 * a shop that only learns about payments through them will always have this
 * gap.
 *
 * This asks DOKU directly about recent unpaid orders and marks the ones that
 * were in fact paid, with the same CRM sync and confirmation email a webhook
 * would have triggered.
 *
 * Checks widen as they go — 10 and 30 minutes, then 1, 3, 8, 16, 30 and 46
 * hours — so an order is asked about eight times over roughly two days and
 * then never again. A missed notification shows up almost immediately or not
 * at all, so there is nothing to gain from polling an abandoned order forever.
 */

/**
 * Minutes after the order at which each successive check falls due.
 *
 * The first was an hour, which during a sale meant a customer paid, waited,
 * saw nothing, and messaged us before anything had even looked — and if the
 * hourly job was itself running behind, as it was on 15 October, the payment
 * went unnoticed entirely. Thirty-two orders worth RM7,996 were sitting paid
 * and unrecognised when somebody finally asked.
 *
 * So the first look is almost immediate and the gaps widen from there. A
 * missed notification shows up at once or not at all, so the early checks are
 * where the value is; the later ones are a formality that costs one query.
 */
const CHECK_OFFSETS_MINUTES = [10, 30, 60, 180, 480, 960, 1800, 2760];

/** Beyond this an order is left alone regardless — the checkout has expired. */
const MAX_AGE_HOURS = 48;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Same guard as the reminder job: compared in constant time. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron signs its calls with "Authorization: Bearer <CRON_SECRET>" and
  // nothing else, so that form has to be accepted or the schedule silently
  // gets a 401 every time. The other two are kept for the external caller and
  // for triggering a run by hand.
  const url = new URL(request.url);
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = bearer || request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";

  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

interface OrderRow {
  id: string;
  order_number: string;
  total: number;
  created_at: string;
  payment_check_count: number | null;
}

/**
 * This asks DOKU about each due order one at a time, so a run catching up on
 * a backlog takes minutes — the manual run this morning took 3m41s. Left at
 * the default it would be cut off partway through and the rest of the orders
 * would wait another cycle.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDokuStatusConfigured()) {
    return Response.json({ skipped: "DOKU not configured", checked: 0 });
  }

  const supabase = getSupabase();
  const now = Date.now();
  const oldestToConsider = new Date(now - MAX_AGE_HOURS * 3600_000).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, total, created_at, payment_check_count")
    .neq("payment_status", "paid")
    .eq("payment_method", "doku")
    .gte("created_at", oldestToConsider)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Record<string, unknown>[] = [];

  for (const order of (orders || []) as OrderRow[]) {
    const count = order.payment_check_count ?? 0;

    // Seven checks and no more.
    if (count >= CHECK_OFFSETS_MINUTES.length) continue;

    const dueAt =
      new Date(order.created_at).getTime() + CHECK_OFFSETS_MINUTES[count] * 60_000;
    if (now < dueAt) continue;

    const status = await getDokuPaymentStatus(order.order_number);

    // A failed lookup is not a failed payment. Record the attempt so the
    // schedule advances, and leave the order untouched.
    if (!status.ok) {
      await supabase
        .from("orders")
        .update({ payment_check_count: count + 1, payment_checked_at: new Date().toISOString() })
        .eq("id", order.id);
      results.push({ order: order.order_number, status: "lookup failed", reason: status.error });
      continue;
    }

    if (!status.paid) {
      await supabase
        .from("orders")
        .update({ payment_check_count: count + 1, payment_checked_at: new Date().toISOString() })
        .eq("id", order.id);
      results.push({
        order: order.order_number,
        status: "not paid",
        doku_status: status.status,
        check: count + 1,
      });
      continue;
    }

    // Paid — but only if DOKU holds the amount we expect. A mismatch means this
    // is not the payment for this order, and marking it paid would ship goods
    // against someone else's money.
    const expected = Number(order.total);
    const received = status.amount;

    if (received !== null && Math.abs(received - expected) > 0.01) {
      await supabase
        .from("orders")
        .update({ payment_check_count: count + 1, payment_checked_at: new Date().toISOString() })
        .eq("id", order.id);
      results.push({
        order: order.order_number,
        status: "AMOUNT MISMATCH — not marked paid",
        expected,
        received,
      });
      continue;
    }

    await markOrderPaid(
      supabase,
      order.order_number,
      {
        status: "paid",
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      },
      {
        payment_reference: status.transactionId ?? "",
        payment_checked_at: new Date().toISOString(),
      },
    );

    const { syncOrderToCRM } = await import("@/lib/crm-sync");
    const { sendOrderConfirmationEmail } = await import("@/lib/email");

    await syncOrderToCRM(order.order_number).catch((err: Error) =>
      console.error("[CRM Sync] Error from payment status check:", err),
    );
    await sendOrderConfirmationEmail(order.order_number).catch((err: Error) =>
      console.error("[Email] Error from payment status check:", err),
    );

    console.log(
      `[PaymentCheck] ${order.order_number} was paid at DOKU (${status.channel}) but never notified — marked paid.`,
    );

    results.push({
      order: order.order_number,
      status: "MARKED PAID",
      amount: received,
      channel: status.channel,
    });
  }

  const recovered = results.filter((r) => r.status === "MARKED PAID");

  return Response.json({
    checked: results.length,
    recovered: recovered.length,
    results,
  });
}
