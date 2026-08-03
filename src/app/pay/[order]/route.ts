import { createClient } from "@supabase/supabase-js";
import { createDokuCheckout, isDokuConfigured } from "@/lib/doku";

/**
 * Resume payment for an unpaid order: /pay/82WFP
 *
 * WhatsApp reminders link here rather than to the original DOKU URL. A DOKU
 * checkout session is single-use — once a customer's payment fails, that
 * session is finished and opening its link just redirects to callback_url,
 * showing "Order Received" instead of a way to pay. Since a failed payment is
 * the usual reason an order sits unpaid, the reminder was reliably sending
 * people to a link that could not take their money.
 *
 * This mints a fresh checkout on each visit and redirects straight to it, so
 * the link in a message stays good however long it sits there.
 *
 * The amount always comes from the order row, never from the request, so the
 * link cannot be manipulated into charging a different price. Guessing another
 * customer's order number only offers a stranger the chance to pay their bill.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

const PAID_STATUSES = ["paid", "processing", "shipped", "completed", "delivered"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ order: string }> },
) {
  const { order: orderParam } = await params;
  const orderNumber = String(orderParam || "").trim().toUpperCase();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  const confirmation = `${origin}/order-confirmation?order=${encodeURIComponent(orderNumber)}`;

  if (!orderNumber) return Response.redirect(`${origin}/`, 302);

  const supabase = getSupabase();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, total, shipping_cost, items, shipping, voucher_code")
    .eq("order_number", orderNumber)
    .single();

  // Nothing to pay for — send them somewhere sensible rather than an error page.
  if (!order) return Response.redirect(`${origin}/`, 302);

  const alreadyPaid =
    order.payment_status === "paid" || PAID_STATUSES.includes(String(order.status));
  if (alreadyPaid) return Response.redirect(confirmation, 302);

  if (!isDokuConfigured()) return Response.redirect(confirmation, 302);

  try {
    const checkout = await createDokuCheckout({
      orderNumber: order.order_number,
      total: Number(order.total),
      shippingCost: Number(order.shipping_cost || 0),
      items: order.items || [],
      voucherCode: order.voucher_code,
      customer: order.shipping || {},
      origin,
    });

    // Keep the newest link on the order so admin and any later reminder show
    // the one that actually works.
    await supabase
      .from("orders")
      .update({ payment_reference: checkout.checkoutId, payment_url: checkout.checkoutUrl })
      .eq("id", order.id);

    return Response.redirect(checkout.checkoutUrl, 302);
  } catch (err) {
    console.error(`Resume payment failed for ${orderNumber}:`, err);
    // Better to land on their order than a stack trace; they can contact support.
    return Response.redirect(confirmation, 302);
  }
}
