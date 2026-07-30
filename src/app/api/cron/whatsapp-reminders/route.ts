import { createHash, timingSafeEqual } from "crypto";
import {
  RECENT_PAYMENT_WINDOW_HOURS,
  getSupabase,
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
 *  - nobody who paid in the last 24h, since their leftover pending orders are
 *    almost always failed attempts at the purchase they completed
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

  const supabase = getSupabase();
  const now = Date.now();
  const readyBefore = new Date(now - config.delay_hours * 3600_000).toISOString();
  const paidSince = new Date(now - RECENT_PAYMENT_WINDOW_HOURS * 3600_000).toISOString();

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

  // Phones that completed a payment recently — checked once rather than per order.
  const { data: recentPaid } = await supabase
    .from("orders")
    .select("shipping")
    .eq("payment_status", "paid")
    .gte("created_at", paidSince)
    .limit(500);

  const paidPhones = new Set(
    (recentPaid || [])
      .map((o) => normalisePhone((o.shipping as { phone?: string } | null)?.phone))
      .filter(Boolean) as string[],
  );

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

    if (paidPhones.has(phone)) {
      // They already bought. Suppress the leftovers permanently rather than
      // re-checking them every hour.
      await supabase.from("orders").update({ reminder_sent_at: stamp() }).in("id", ids);
      results.push({
        order: group.map((o) => o.order_number).join(", "),
        status: "skipped",
        reason: "customer paid within 24h",
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
