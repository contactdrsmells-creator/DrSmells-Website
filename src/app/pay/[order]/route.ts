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

interface OrderItem {
  product_name: string;
  variation?: string;
  quantity: number;
  unit_price: number;
  /** Present only on subscription lines; holds the recurring price and cadence. */
  subscription?: { price: number; interval_months: number };
}

/**
 * Rebuilds a Stripe Checkout Session for an unpaid order.
 *
 * Subscription lines are recreated as recurring prices rather than one-off
 * charges — otherwise resuming a subscription order would take a single payment
 * and quietly never set up the recurring billing the customer signed up for.
 */
async function createStripeCheckout(
  order: {
    order_number: string;
    id: string;
    items: OrderItem[];
    shipping_cost: number | null;
    shipping: { email?: string } | null;
    discount: number | null;
    voucher_code: string | null;
  },
  origin: string,
): Promise<string> {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const items = order.items || [];
  const hasSubscription = items.some((item) => item.subscription);

  const lineItems = items.map((item) => ({
    price_data: {
      currency: "myr",
      product_data: { name: `${item.product_name}${item.variation ? ` (${item.variation})` : ""}` },
      unit_amount: Math.round((item.subscription?.price ?? item.unit_price) * 100),
      ...(item.subscription
        ? {
            recurring: {
              interval: "month" as const,
              interval_count: item.subscription.interval_months,
            },
          }
        : {}),
    },
    quantity: item.quantity,
  }));

  const shippingCost = Number(order.shipping_cost || 0);
  if (shippingCost > 0) {
    lineItems.push({
      price_data: {
        currency: "myr",
        product_data: { name: "Shipping" },
        unit_amount: Math.round(shippingCost * 100),
      },
      quantity: 1,
    });
  }

  // Stripe rejects negative line items, so a voucher has to be expressed as a
  // one-off coupon — the same way checkout does it. Without this the customer
  // resuming payment would be quoted the full price and lose their discount.
  //
  // On a subscription the discount repeats forever, so the customer keeps the
  // price they signed up at rather than the second invoice jumping to full
  // price. A one-off order has no later invoice, so the duration is moot.
  const discount = Number(order.discount || 0);
  const discounts = discount > 0
    ? [{
        coupon: (await stripe.coupons.create({
          amount_off: Math.round(discount * 100),
          currency: "myr",
          duration: hasSubscription ? "forever" : "once",
          name: order.voucher_code || "Discount",
        })).id,
      }]
    : undefined;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    discounts,
    mode: hasSubscription ? "subscription" : "payment",
    success_url: `${origin}/order-confirmation?order=${order.order_number}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout`,
    metadata: { order_number: order.order_number, order_id: order.id },
    customer_email: order.shipping?.email,
    ...(hasSubscription
      ? {
          subscription_data: {
            metadata: { order_number: order.order_number, order_id: order.id },
          },
        }
      : {}),
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

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
    .select(
      "id, order_number, status, payment_status, payment_method, total, shipping_cost, discount, items, shipping, voucher_code",
    )
    .eq("order_number", orderNumber)
    .single();

  // Nothing to pay for — send them somewhere sensible rather than an error page.
  if (!order) return Response.redirect(`${origin}/`, 302);

  const alreadyPaid =
    order.payment_status === "paid" || PAID_STATUSES.includes(String(order.status));
  if (alreadyPaid) return Response.redirect(confirmation, 302);

  // Resume with the method the customer originally chose. Sending a Stripe
  // order to DOKU would charge them through a gateway they never picked, and
  // would turn a subscription into a single payment.
  const usesStripe = order.payment_method === "stripe";

  if (usesStripe ? !process.env.STRIPE_SECRET_KEY : !isDokuConfigured()) {
    return Response.redirect(confirmation, 302);
  }

  try {
    let checkoutUrl: string;
    let reference: string | null = null;

    if (usesStripe) {
      checkoutUrl = await createStripeCheckout(order, origin);
    } else {
      const checkout = await createDokuCheckout({
        orderNumber: order.order_number,
        total: Number(order.total),
        shippingCost: Number(order.shipping_cost || 0),
        items: order.items || [],
        voucherCode: order.voucher_code,
        customer: order.shipping || {},
        origin,
      });
      checkoutUrl = checkout.checkoutUrl;
      reference = checkout.checkoutId;
    }

    // Keep the newest link on the order so admin and any later reminder show
    // the one that actually works.
    await supabase
      .from("orders")
      .update({
        payment_url: checkoutUrl,
        ...(reference ? { payment_reference: reference } : {}),
      })
      .eq("id", order.id);

    return Response.redirect(checkoutUrl, 302);
  } catch (err) {
    console.error(`Resume payment failed for ${orderNumber}:`, err);
    // Better to land on their order than a stack trace; they can contact support.
    return Response.redirect(confirmation, 302);
  }
}
