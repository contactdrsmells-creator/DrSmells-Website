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
 * Checks widen as they go — 1, then 3, 6, 6, 6, 12 and 12 hours later — so an
 * order is asked about seven times over roughly two days and then never again.
 * A missed notification shows up almost immediately or not at all, so there is
 * nothing to gain from polling an abandoned order forever.
 */

/** Hours after the order at which each successive check falls due. */
const CHECK_OFFSETS_HOURS = [1, 4, 10, 16, 22, 34, 46];

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

  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";

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
    if (count >= CHECK_OFFSETS_HOURS.length) continue;

    const dueAt =
      new Date(order.created_at).getTime() + CHECK_OFFSETS_HOURS[count] * 3600_000;
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
