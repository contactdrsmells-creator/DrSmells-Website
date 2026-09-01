import { createClient } from "@supabase/supabase-js";
import { createDokuCheckout, isDokuConfigured } from "@/lib/doku";
import { createAtomePayment, isAtomeConfigured, ATOME_MIN_TOTAL_MYR } from "@/lib/atome";
import { resolveUnitPrice, resolveSubscriptionPrice, hasUnmatchedCombo } from "@/lib/pricing";
import { normalisePhoneForStorage } from "@/lib/phone";
import { generateOrderNumber } from "@/lib/order-number";
import { countPaidVoucherUses } from "@/lib/voucher-usage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** Meta's click ids are opaque strings; cap them rather than storing anything sent. */
function safeClickId(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v && v.length <= 255 ? v : undefined;
}

/**
 * Records what Meta needs to attribute this sale, while the customer is still
 * here to be recorded. A payment webhook arrives from DOKU's server — reading
 * the IP or user agent there would describe a gateway, not a shopper.
 */
async function storeMetaAttribution(
  supabase: ReturnType<typeof getSupabase>,
  orderNumber: string,
  meta: unknown,
  request: Request,
): Promise<void> {
  const clickIds = (meta ?? {}) as { fbc?: unknown; fbp?: unknown };

  // Vercel puts the client first in x-forwarded-for; later entries are proxies.
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const clientIp = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || undefined;
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://drsmells.com.my";

  const attribution = {
    fbc: safeClickId(clickIds.fbc),
    fbp: safeClickId(clickIds.fbp),
    client_ip_address: clientIp,
    client_user_agent: request.headers.get("user-agent") || undefined,
    event_source_url: `${origin}/checkout`,
  };

  const { error } = await supabase
    .from("orders")
    .update({ meta_attribution: attribution })
    .eq("order_number", orderNumber);

  if (error) {
    console.error(`[MetaCAPI] Could not store attribution for ${orderNumber}:`, error.message);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, shipping, payment_method, subtotal, shipping_cost, discount, voucher_code, total, source, has_subscription, voucher_free_shipping, meta } = body;

    if (!items?.length || !shipping?.name || !shipping?.email || !shipping?.phone) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["stripe", "doku", "atome"].includes(payment_method)) {
      return Response.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Store the number in international form so WhatsApp, Strive and the CRM
    // all receive a consistent value. Only applied to Malaysian orders — a
    // leading 0 means something different in every other country.
    shipping.phone = normalisePhoneForStorage(shipping.phone, shipping.country);

    // Server-side price verification
    let verifiedTotal = 0;
    for (const item of items) {
      const { data: product } = await supabase
        .from("products")
        .select("price, sale_price, variations, variation_combos")
        .eq("id", item.product_id)
        .single();

      if (!product) {
        return Response.json({ error: `Product not found: ${item.product_name}` }, { status: 400 });
      }

      // Bundles price via variation_combos and have no variations at all, so
      // resolving by variation name alone silently fell back to the base price
      // and rejected every bundle order as a price mismatch.
      //
      // Subscription prices are resolved from the product too — never taken
      // from the request, which would let a caller set its own recurring price.
      // A selection that matches no combination price would silently fall back
      // to the product's base price — and since the cart resolves prices the
      // same way, both sides would agree on a figure that is simply wrong. One
      // bundle sold at RM49.90 instead of RM89 this way. Refuse the order
      // rather than take the wrong money.
      if (hasUnmatchedCombo(product, item.variation)) {
        console.error(
          `[Checkout] "${item.product_name}" (${item.variation}) matches no combination price — ` +
          `its combinations are keyed on different attributes than customers are offered.`,
        );
        return Response.json(
          { error: `Sorry, "${item.product_name}" is not priced correctly at the moment. Please contact us and we will sort it out.` },
          { status: 400 },
        );
      }

      const serverPrice = item.subscription
        ? (resolveSubscriptionPrice(product, item.variation) ?? resolveUnitPrice(product, item.variation))
        : resolveUnitPrice(product, item.variation);

      verifiedTotal += serverPrice * item.quantity;
    }

    // Verify shipping cost from zones
    const { data: shippingSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "shipping")
      .single();

    const zones = shippingSettings?.value?.zones || [];
    const matchedZone = zones.find((z: { states: string[] }) => z.states.includes(shipping.state));
    let serverShippingCost = matchedZone
      ? (matchedZone.free_shipping_min > 0 && verifiedTotal >= matchedZone.free_shipping_min ? 0 : matchedZone.flat_rate)
      : (shipping_cost || 0);

    // Verify voucher server-side
    let serverDiscount = 0;
    if (voucher_code) {
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", voucher_code)
        .eq("active", true)
        .single();

      if (voucher) {
        const now = new Date();
        const notExpired = !voucher.end_date || new Date(voucher.end_date) > now;
        const notStarted = voucher.start_date && new Date(voucher.start_date) > now;
        // Counted from paid orders rather than read off the voucher, so an
        // abandoned checkout cannot consume someone else's use.
        const withinLimit =
          !voucher.max_uses ||
          (await countPaidVoucherUses(supabase, voucher.code)) < voucher.max_uses;
        const meetsMin = verifiedTotal >= (voucher.min_order_amount || 0);

        const subOk = !has_subscription || voucher.applicable_for_subscription;

        if (notExpired && !notStarted && withinLimit && meetsMin && subOk) {
          // Round to whole cents — a percentage voucher otherwise yields
          // fractional cents (e.g. RM133.245), which DOKU rejects as an invalid
          // price and which would be stored/displayed inconsistently.
          const rawDiscount = voucher.discount_type === "percentage"
            ? Math.min(verifiedTotal * (voucher.discount_value / 100), verifiedTotal)
            : Math.min(voucher.discount_value, verifiedTotal);
          serverDiscount = Math.round(rawDiscount * 100) / 100;

          if (voucher.free_shipping) {
            serverShippingCost = 0;
          }

          // Nothing is incremented here. Usage is the number of paid orders
          // carrying this code, which the order below records — counting at
          // this point counted people who never paid.
        }
      }
    }

    const serverTotal = Math.max(0, verifiedTotal - serverDiscount) + serverShippingCost;

    if (Math.abs(serverTotal - total) > 1) {
      return Response.json({ error: "Price mismatch. Please refresh and try again." }, { status: 400 });
    }

    // Create order
    const orderNumber = await generateOrderNumber();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        status: "pending",
        payment_method,
        payment_status: "pending",
        items,
        shipping,
        source: source || "Direct",
        subtotal: verifiedTotal,
        shipping_cost: serverShippingCost,
        discount: serverDiscount,
        voucher_code: voucher_code || null,
        total: serverTotal,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      return Response.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Stored as a separate best-effort write, never as part of the insert
    // above: Postgres rejects the whole statement if the column is missing, so
    // folding this in would mean an unrun migration silently stopped customers
    // from ordering at all.
    await storeMetaAttribution(supabase, orderNumber, meta, request);

    // Generate payment redirect URL
    let redirect_url = "";

    if (payment_method === "stripe") {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return Response.json({ error: "Stripe not configured" }, { status: 500 });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeSecretKey);

      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      const subscriptionItems = items.filter((item: { subscription?: { interval_months: number } }) => item.subscription);

      if (has_subscription && subscriptionItems.length > 0) {
        const onetimeItems = items.filter((item: { subscription?: { interval_months: number } }) => !item.subscription);

        const lineItems: Array<{ price_data: { currency: string; product_data: { name: string }; unit_amount: number; recurring?: { interval: "month"; interval_count: number } }; quantity: number }> = [];

        subscriptionItems.forEach((item: { product_name: string; quantity: number; variation: string; subscription: { interval_months: number; price: number } }) => {
          lineItems.push({
            price_data: {
              currency: "myr",
              product_data: {
                name: `${item.product_name} (${item.variation})`,
              },
              unit_amount: Math.round(item.subscription.price * 100),
              recurring: {
                interval: "month" as const,
                interval_count: item.subscription.interval_months,
              },
            },
            quantity: item.quantity,
          });
        });

        // One-off items and shipping go on the FIRST INVOICE, not into
        // line_items. A subscription-mode session treats its line items as the
        // thing being subscribed to, so a one-off sent that way is at best
        // charged again at every renewal and at worst rejected outright. This
        // is Stripe's supported route for "charge this once, alongside the
        // subscription".
        //
        // add_invoice_items needs a real Product id rather than an inline name,
        // so each one is created first. That is one extra call per distinct
        // item, only on a mixed cart.
        const addInvoiceItems: Array<{
          price_data: { currency: string; product: string; unit_amount: number };
          quantity: number;
        }> = [];

        const onceOff: Array<{ name: string; amount: number; quantity: number }> = [
          ...onetimeItems.map((item: { product_name: string; variation: string; unit_price: number; quantity: number }) => ({
            name: `${item.product_name} (${item.variation})`,
            amount: Math.round(item.unit_price * 100),
            quantity: item.quantity,
          })),
          ...(serverShippingCost > 0
            ? [{ name: "Shipping", amount: Math.round(serverShippingCost * 100), quantity: 1 }]
            : []),
        ];

        for (const entry of onceOff) {
          const product = await stripe.products.create({ name: entry.name });
          addInvoiceItems.push({
            price_data: { currency: "myr", product: product.id, unit_amount: entry.amount },
            quantity: entry.quantity,
          });
        }

        // Stripe rejects negative line items — a coupon is the supported way to
        // apply a voucher discount.
        //
        // "forever" on a subscription-only cart: the customer keeps paying the
        // price they signed up at, rather than the second invoice jumping to
        // full price.
        //
        // "once" as soon as anything one-off is in the basket, because the
        // discount was sized against a total that included it. RM19.40 off a
        // RM194 basket is 10%; repeated forever against a RM72 renewal it
        // becomes 27% off, for good, from a single voucher.
        const discounts = serverDiscount > 0
          ? [{ coupon: (await stripe.coupons.create({
              amount_off: Math.round(serverDiscount * 100),
              currency: "myr",
              duration: onceOff.length > 0 ? "once" : "forever",
              name: voucher_code || "Discount",
            })).id }]
          : undefined;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: lineItems,
          discounts,
          mode: "subscription",
          success_url: `${origin}/order-confirmation?order=${orderNumber}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout`,
          metadata: {
            order_number: orderNumber,
            order_id: order.id,
          },
          customer_email: shipping.email,
          subscription_data: {
            metadata: {
              order_number: orderNumber,
              order_id: order.id,
            },
            ...(addInvoiceItems.length > 0 ? { add_invoice_items: addInvoiceItems } : {}),
          },
        });

        await supabase
          .from("orders")
          .update({ payment_reference: session.id, payment_url: session.url || null })
          .eq("id", order.id);

        redirect_url = session.url || "";
      } else {
        const lineItems = items.map((item: { product_name: string; quantity: number; unit_price: number; variation: string }) => ({
          price_data: {
            currency: "myr",
            product_data: {
              name: `${item.product_name} (${item.variation})`,
            },
            unit_amount: Math.round(item.unit_price * 100),
          },
          quantity: item.quantity,
        }));

        if (serverShippingCost > 0) {
          lineItems.push({
            price_data: {
              currency: "myr",
              product_data: { name: "Shipping" },
              unit_amount: Math.round(serverShippingCost * 100),
            },
            quantity: 1,
          });
        }

        // Without this the voucher discount is silently dropped and the customer
        // is charged the full amount.
        const discounts = serverDiscount > 0
          ? [{ coupon: (await stripe.coupons.create({
              amount_off: Math.round(serverDiscount * 100),
              currency: "myr",
              duration: "once",
              name: voucher_code || "Discount",
            })).id }]
          : undefined;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: lineItems,
          discounts,
          mode: "payment",
          success_url: `${origin}/order-confirmation?order=${orderNumber}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout`,
          metadata: {
            order_number: orderNumber,
            order_id: order.id,
          },
          customer_email: shipping.email,
        });

        await supabase
          .from("orders")
          .update({ payment_reference: session.id, payment_url: session.url || null })
          .eq("id", order.id);

        redirect_url = session.url || "";
      }
    } else if (payment_method === "atome") {
      if (!isAtomeConfigured()) {
        return Response.json({ error: "Atome not configured" }, { status: 500 });
      }
      // Atome refuses anything under RM10; better said here than as a
      // gateway error after the order row already exists.
      if (serverTotal < ATOME_MIN_TOTAL_MYR) {
        return Response.json({ error: `Atome requires a minimum of RM${ATOME_MIN_TOTAL_MYR}` }, { status: 400 });
      }

      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      try {
        const payment = await createAtomePayment({
          orderNumber,
          total: serverTotal,
          shippingCost: serverShippingCost,
          items,
          voucherCode: voucher_code,
          customer: shipping,
          origin,
        });
        redirect_url = payment.checkoutUrl;

        await supabase
          .from("orders")
          .update({ payment_reference: payment.referenceId, payment_url: redirect_url || null })
          .eq("id", order.id);
      } catch (err) {
        console.error("[Atome] Checkout failed:", (err as Error).message);
        return Response.json({ error: "Failed to create Atome payment" }, { status: 500 });
      }
    } else if (payment_method === "doku") {
      if (!isDokuConfigured()) {
        return Response.json({ error: "DOKU not configured" }, { status: 500 });
      }

      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      try {
        const checkout = await createDokuCheckout({
          orderNumber,
          total: serverTotal,
          shippingCost: serverShippingCost,
          items,
          voucherCode: voucher_code,
          customer: shipping,
          origin,
        });
        redirect_url = checkout.checkoutUrl;

        await supabase
          .from("orders")
          .update({ payment_reference: checkout.checkoutId, payment_url: redirect_url || null })
          .eq("id", order.id);
      } catch {
        return Response.json({ error: "Failed to create DOKU checkout" }, { status: 500 });
      }
    }

    return Response.json({
      order_number: orderNumber,
      order_id: order.id,
      redirect_url,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
