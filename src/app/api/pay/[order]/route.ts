import { countPaidVoucherUses } from "@/lib/voucher-usage";
import { voucherWindow } from "@/lib/voucher-dates";
import { checkMinimum } from "@/lib/payment-minimums";
import {
  cleanOrderNumber, isPaid, itemsSubtotal, loadResumeOrder, publicSummary, serviceSupabase,
} from "@/lib/resume-order";

/**
 * The page in front of a resumed payment: what is owed, and a promo code box.
 *
 * GET  — the order's summary, without contact details.
 * POST — { code } puts a promo code on the unpaid order and reprices it.
 *
 * Open to customers, like checkout itself, and held to the same rules: the
 * voucher is checked here against the order's own amounts, never against
 * anything the page sends. The only thing a stranger holding an order number
 * can do with it is make somebody else's bill smaller.
 */

const OLDEST_DAYS = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ order: string }> },
) {
  const orderNumber = cleanOrderNumber((await params).order);
  const order = await loadResumeOrder(orderNumber);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(publicSummary(order), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ order: string }> },
) {
  const orderNumber = cleanOrderNumber((await params).order);
  const body = await request.json().catch(() => ({}));
  const typed = String(body?.code || "").replace(/\s+/g, "").toUpperCase().slice(0, 40);
  if (!typed) return Response.json({ error: "Please enter a promo code" }, { status: 400 });
  if (!/^[A-Z0-9_-]+$/.test(typed)) return Response.json({ error: "Invalid promo code" }, { status: 400 });

  const order = await loadResumeOrder(orderNumber);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (isPaid(order)) return Response.json({ error: "This order is already paid" }, { status: 409 });
  if (String(order.status) === "cancelled") {
    return Response.json({ error: "This order was cancelled" }, { status: 409 });
  }
  if (order.voucher_code) {
    return Response.json({ error: `Promo code ${order.voucher_code} is already applied` }, { status: 409 });
  }
  if (Date.now() - new Date(order.created_at).getTime() > OLDEST_DAYS * 864e5) {
    return Response.json({ error: "This order is too old for a promo code. Please place a new order." }, { status: 409 });
  }

  const supabase = serviceSupabase();
  const { data: voucher } = await supabase.from("vouchers").select("*").ilike("code", typed).maybeSingle();
  if (!voucher) return Response.json({ error: "Invalid promo code" }, { status: 400 });
  if (!voucher.active) return Response.json({ error: "This promo code is no longer available" }, { status: 400 });

  const dates = voucherWindow(voucher.start_date, voucher.end_date);
  if (!dates.ok) return Response.json({ error: dates.error }, { status: 400 });

  if (voucher.max_uses && (await countPaidVoucherUses(supabase, voucher.code)) >= voucher.max_uses) {
    return Response.json({ error: "This promo code is fully redeemed" }, { status: 400 });
  }

  const subtotal = itemsSubtotal(order);
  if (voucher.min_order_amount && subtotal < voucher.min_order_amount) {
    return Response.json(
      { error: `Minimum order of RM${Number(voucher.min_order_amount).toFixed(2)} required` },
      { status: 400 },
    );
  }

  const hasSubscription = (order.items || []).some((i) => i.subscription);
  if (hasSubscription && !voucher.applicable_for_subscription) {
    return Response.json({ error: "This promo code is not for subscription orders" }, { status: 400 });
  }

  // Priced exactly as checkout prices it: whole cents, never more than the items.
  const raw = voucher.discount_type === "percentage"
    ? Math.min(subtotal * (Number(voucher.discount_value) / 100), subtotal)
    : Math.min(Number(voucher.discount_value), subtotal);
  const discount = Math.round(raw * 100) / 100;
  const shippingCost = voucher.free_shipping ? 0 : Number(order.shipping_cost || 0);
  const pointsDiscount = Number(order.points_discount || 0);
  const total = Math.round((Math.max(0, subtotal - discount - pointsDiscount) + shippingCost) * 100) / 100;

  if (discount <= 0 && shippingCost === Number(order.shipping_cost || 0)) {
    return Response.json({ error: "This promo code gives no discount on this order" }, { status: 400 });
  }

  const tooSmall = checkMinimum(order.payment_method === "stripe" ? "stripe" : "doku", total);
  if (tooSmall) return Response.json({ error: tooSmall }, { status: 400 });

  // Guarded on the row still being unpaid and code-free, so two taps — or a
  // payment landing at the same moment — cannot stack discounts or reprice a
  // paid order. The saved checkout link is dropped: it was made at the old
  // price, and the Pay button must make a new one.
  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      voucher_code: voucher.code,
      discount,
      shipping_cost: shippingCost,
      total,
      payment_url_created_at: null,
    })
    .eq("id", order.id)
    .is("voucher_code", null)
    .neq("payment_status", "paid")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(`[Pay] Could not apply ${voucher.code} to ${orderNumber}:`, error.message);
    return Response.json({ error: "Could not apply the promo code. Please try again." }, { status: 500 });
  }
  if (!updated) return Response.json({ error: "This order has changed. Please refresh the page." }, { status: 409 });

  return Response.json(publicSummary(updated));
}
