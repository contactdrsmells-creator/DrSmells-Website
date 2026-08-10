import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOrderNumber } from "@/lib/order-number";
import { syncOrderToCRM } from "@/lib/crm-sync";
import { sendOrderConfirmationEmail } from "@/lib/email";

/**
 * Turns a subscription renewal into an order someone can pack.
 *
 * Stripe charged the customer again; without this the only trace was
 * payment_status being set to "paid" on the ORIGINAL order, which was already
 * paid. Nothing new appeared in the CRM, so the money arrived and no one knew
 * to post the next one. Every renewal since subscriptions launched was
 * invisible in exactly this way.
 *
 * Only the subscription items are carried over. Anything bought alongside the
 * first order was a one-off and must not ship again.
 */

interface OrderItem {
  product_id?: string;
  product_name?: string;
  variation?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  image_url?: string;
  subscription?: { interval_months: number; price: number } | null;
}

export interface RenewalInvoice {
  id?: string;
  amount_paid?: number;
  billing_reason?: string;
  subscription?: string;
  subscription_details?: { metadata?: { order_number?: string } };
}

export interface RenewalResult {
  created?: string;
  skipped?: string;
  error?: string;
}

export async function createRenewalOrder(
  supabase: SupabaseClient,
  invoice: RenewalInvoice,
): Promise<RenewalResult> {
  const originalNumber = invoice.subscription_details?.metadata?.order_number;
  if (!originalNumber) return { skipped: "no order_number on the subscription" };
  if (!invoice.id) return { skipped: "invoice has no id" };

  // Stripe retries a webhook until it gets a 2xx, and the same invoice can
  // arrive more than once. The invoice id is recorded as the payment reference,
  // so a repeat finds the order it already created rather than making a second.
  const { data: already } = await supabase
    .from("orders")
    .select("order_number")
    .eq("payment_reference", invoice.id)
    .maybeSingle();

  if (already) return { skipped: `already created as ${already.order_number}` };

  const { data: original } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", originalNumber)
    .maybeSingle();

  if (!original) return { skipped: `original order ${originalNumber} not found` };

  const items = ((original.items || []) as OrderItem[]).filter((item) => item.subscription);
  if (!items.length) return { skipped: "original order has no subscription items" };

  // What Stripe actually took, rather than a total recomputed here — the
  // invoice is the authority on what the customer paid.
  const total = typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : 0;

  const orderNumber = await generateOrderNumber();

  const { error } = await supabase.from("orders").insert({
    order_number: orderNumber,
    status: "paid",
    payment_method: "stripe",
    payment_status: "paid",
    payment_reference: invoice.id,
    items,
    shipping: original.shipping,
    // Kept so the renewal is credited to whatever first brought the customer in,
    // rather than appearing out of nowhere as Direct.
    source: original.source || "Subscription",
    subtotal: total,
    // Shipping was charged once, on the first invoice, and does not recur.
    shipping_cost: 0,
    discount: 0,
    total,
    stripe_subscription_id: invoice.subscription || original.stripe_subscription_id || null,
  });

  if (error) {
    console.error(`[Subscription] Could not create renewal order for ${originalNumber}:`, error.message);
    return { error: error.message };
  }

  // Both are best-effort: the order exists and the money has arrived, so a
  // failure here must not make Stripe retry and risk a second order.
  await syncOrderToCRM(orderNumber).catch((err: Error) =>
    console.error("[CRM Sync] Error on subscription renewal:", err.message),
  );
  await sendOrderConfirmationEmail(orderNumber).catch((err: Error) =>
    console.error("[Email] Error on subscription renewal:", err.message),
  );

  console.log(`[Subscription] ${originalNumber} renewed as ${orderNumber} (RM ${total.toFixed(2)})`);
  return { created: orderNumber };
}
