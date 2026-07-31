import { createHash, timingSafeEqual } from "crypto";
import {
  PAYMENT_GRACE_MINUTES,
  QUIET_HOURS_END,
  currentHourInBusinessTimezone,
  getSupabase,
  isQuietHours,
  loadAutomationConfig,
  normalisePhone,
  sendToStrive,
} from "@/lib/whatsapp-automation";

/**
 * Sends a WhatsApp follow-up for orders left unpaid.
 *
 * Runs on a schedule (GitHub Actions hourly — Vercel Hobby crons only fire once
 * a day, which is too coarse for a 3-hour rule). Protected by CRON_SECRET
 * because it triggers real customer messages.
 *
 * Three rules keep it from being a nuisance:
 *  - only orders placed after the automation was switched on
 *  - one message per customer, not per order (people retry checkout, leaving
 *    several identical pending orders behind)
 *  - nobody who went on to pay. Customers usually fail a few times and succeed
 *    last, so the completed order is created *after* the abandoned ones; a
 *    payment from the same number at or after the unpaid order means they got
 *    there in the end.
 */

interface OrderRow {
  id: string;
  order_number: string;
  total: number;
  payment_url: string | null;
  created_at: string;
  shipping: { name?: string; phone?: string } | null;
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (!provided) return false;

  // Hash both sides so timingSafeEqual gets equal-length buffers.
  return timingSafeEqual(
    createHash("sha256").update(secret).digest(),
    createHash("sha256").update(provided).digest(),
  );
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await loadAutomationConfig();
  if (!config.enabled) {
    return Response.json({ skipped: "automation disabled", sent: 0 });
  }
  if (!config.flowbuilder_key || !config.webhook_url) {
    return Response.json({ error: "Strive webhook not configured" }, { status: 500 });
  }
  if (!config.activated_at) {
    return Response.json({ skipped: "no activation timestamp", sent: 0 });
  }

  // Return before touching any order: nothing is claimed or marked, so orders
  // that came due overnight are still waiting for the 08:00 run rather than
  // being silently consumed.
  if (isQuietHours()) {
    return Response.json({
      skipped: "quiet hours",
      local_hour: currentHourInBusinessTimezone(),
      resumes_at: `${String(QUIET_HOURS_END).padStart(2, "0")}:00 Malaysia time`,
      sent: 0,
    });
  }

  const supabase = getSupabase();
  const now = Date.now();
  const readyBefore = new Date(now - config.delay_hours * 3600_000).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, total, payment_url, created_at, shipping")
    .eq("status", config.trigger_status)
    .is("reminder_sent_at", null)
    .lte("created_at", readyBefore)
    // Never reaches back before the automation was switched on.
    .gte("created_at", config.activated_at)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const candidates = (orders || []) as OrderRow[];

  // Latest successful payment per phone. Only needs to reach back as far as the
  // oldest order under consideration — a payment older than that belongs to an
  // earlier, unrelated purchase and shouldn't suppress this one.
  const oldestCandidate = candidates.length
    ? candidates[candidates.length - 1].created_at
    : new Date(now).toISOString();
  const lookbackFrom = new Date(
    new Date(oldestCandidate).getTime() - PAYMENT_GRACE_MINUTES * 60_000,
  ).toISOString();

  const { data: paidOrders } = await supabase
    .from("orders")
    .select("shipping, created_at")
    .eq("payment_status", "paid")
    .gte("created_at", lookbackFrom)
    .limit(500);

  const lastPaidAt = new Map<string, number>();
  for (const paid of paidOrders || []) {
    const phone = normalisePhone((paid.shipping as { phone?: string } | null)?.phone);
    if (!phone) continue;
    const at = new Date(paid.created_at as string).getTime();
    if (at > (lastPaidAt.get(phone) ?? 0)) lastPaidAt.set(phone, at);
  }

  // Group by customer. Retrying checkout leaves several identical pending
  // orders; the customer should hear from us once.
  const byPhone = new Map<string, OrderRow[]>();
  const results: { order: string; status: string; reason?: string }[] = [];
  const stamp = () => new Date().toISOString();

  for (const order of candidates) {
    const phone = normalisePhone(order.shipping?.phone);
    if (!phone) {
      // Mark it so an unusable number isn't re-examined every hour forever.
      await supabase.from("orders").update({ reminder_sent_at: stamp() }).eq("id", order.id);
      results.push({ order: order.order_number, status: "skipped", reason: "no valid phone" });
      continue;
    }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone)!.push(order);
  }

  for (const [phone, group] of byPhone) {
    const ids = group.map((o) => o.id);

    // Did they pay at or after starting the earliest of these unpaid orders?
    // If so the unpaid ones are failed attempts at a purchase they completed.
    const earliestAttempt = Math.min(...group.map((o) => new Date(o.created_at).getTime()));
    const paidAt = lastPaidAt.get(phone);

    if (paidAt !== undefined && paidAt >= earliestAttempt - PAYMENT_GRACE_MINUTES * 60_000) {
      // Suppress permanently rather than re-checking them every hour.
      await supabase.from("orders").update({ reminder_sent_at: stamp() }).in("id", ids);
      results.push({
        order: group.map((o) => o.order_number).join(", "),
        status: "skipped",
        reason: "customer completed payment",
      });
      continue;
    }

    // Newest order carries the freshest payment link (DOKU links expire in 24h).
    const order = group[0];

    // Claim the whole group before sending, so overlapping runs cannot message
    // the same customer twice.
    const { data: claimed } = await supabase
      .from("orders")
      .update({ reminder_sent_at: stamp() })
      .in("id", ids)
      .is("reminder_sent_at", null)
      .select("id");

    if (!claimed?.length) {
      results.push({ order: order.order_number, status: "skipped", reason: "already claimed" });
      continue;
    }

    const result = await sendToStrive(config, {
      [config.phone_field]: phone,
      customer_name: order.shipping?.name || "there",
      order_id: order.order_number,
      amount: Number(order.total || 0).toFixed(2),
      payment_url: order.payment_url || "",
    });

    if (result.ok) {
      results.push({
        order: order.order_number,
        status: "sent",
        reason: group.length > 1 ? `${group.length} duplicate orders collapsed into one message` : undefined,
      });
    } else {
      await supabase.from("orders").update({ reminder_sent_at: null }).in("id", ids);
      results.push({
        order: order.order_number,
        status: "failed",
        reason: `HTTP ${result.status} ${result.body}`,
      });
      console.error(`[WhatsApp] Reminder failed for ${order.order_number}:`, result.status, result.body);
    }
  }

  return Response.json({
    checked: candidates.length,
    customers: byPhone.size,
    sent: results.filter((r) => r.status === "sent").length,
    results,
  });
}
