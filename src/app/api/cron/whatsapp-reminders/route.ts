import { createHash, timingSafeEqual } from "crypto";
import {
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
 */

interface OrderRow {
  id: string;
  order_number: string;
  total: number;
  payment_url: string | null;
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

  const supabase = getSupabase();
  const now = Date.now();
  const readyBefore = new Date(now - config.delay_hours * 3600_000).toISOString();
  const notOlderThan = new Date(now - config.max_age_hours * 3600_000).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, total, payment_url, shipping")
    .eq("status", config.trigger_status)
    .is("reminder_sent_at", null)
    .lte("created_at", readyBefore)
    .gte("created_at", notOlderThan)
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: { order: string; status: string; reason?: string }[] = [];

  for (const order of (orders || []) as OrderRow[]) {
    const phone = normalisePhone(order.shipping?.phone);
    if (!phone) {
      // Mark it so an unusable number isn't re-examined every hour forever.
      await supabase
        .from("orders")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", order.id);
      results.push({ order: order.order_number, status: "skipped", reason: "no valid phone" });
      continue;
    }

    // Claim before sending: two overlapping runs must not message the same
    // customer twice. Released again if the send fails.
    const { data: claimed } = await supabase
      .from("orders")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", order.id)
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
      results.push({ order: order.order_number, status: "sent" });
    } else {
      await supabase.from("orders").update({ reminder_sent_at: null }).eq("id", order.id);
      results.push({
        order: order.order_number,
        status: "failed",
        reason: `HTTP ${result.status} ${result.body}`,
      });
      console.error(`[WhatsApp] Reminder failed for ${order.order_number}:`, result.status, result.body);
    }
  }

  return Response.json({
    checked: orders?.length || 0,
    sent: results.filter((r) => r.status === "sent").length,
    results,
  });
}
