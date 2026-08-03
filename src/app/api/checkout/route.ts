import { createClient } from "@supabase/supabase-js";
import { createDokuCheckout, isDokuConfigured } from "@/lib/doku";
import { resolveUnitPrice, resolveSubscriptionPrice } from "@/lib/pricing";
import { normalisePhoneForStorage } from "@/lib/phone";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function generateOrderNumber(): Promise<string> {
  try {
    const crmUrl = process.env.CRM_WEBHOOK_URL;
    if (crmUrl) {
      const crmBase = new URL(crmUrl).origin;
      const crmRes = await fetch(`${crmBase}/api/webhook/next-order-id`, {
        headers: { "x-webhook-secret": process.env.CRM_WEBHOOK_SECRET || "" },
      });
      if (crmRes.ok) {
        const crmData = await crmRes.json();
        if (crmData.next_id) {
          const randomLetters = String.fromCharCode(
            65 + Math.floor(Math.random() * 26),
            65 + Math.floor(Math.random() * 26)
          );
          return `${crmData.next_id}W${randomLetters}`;
        }
      }
    }
  } catch {
    console.error("[Checkout] Failed to fetch CRM next order ID");
  }
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DS-${datePart}-${rand}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, shipping, payment_method, subtotal, shipping_cost, discount, voucher_code, total, source, has_subscription, voucher_free_shipping } = body;

    if (!items?.length || !shipping?.name || !shipping?.email || !shipping?.phone) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["stripe", "doku"].includes(payment_method)) {
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
        const withinLimit = !voucher.max_uses || voucher.used_count < voucher.max_uses;
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

          await supabase
            .from("vouchers")
            .update({ used_count: (voucher.used_count || 0) + 1 })
            .eq("id", voucher.id);
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

        onetimeItems.forEach((item: { product_name: string; quantity: number; variation: string; unit_price: number }) => {
          lineItems.push({
            price_data: {
              currency: "myr",
              product_data: {
                name: `${item.product_name} (${item.variation})`,
              },
              unit_amount: Math.round(item.unit_price * 100),
            },
            quantity: item.quantity,
          });
        });

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

        // Stripe rejects negative line items — a coupon is the supported way to
        // apply a voucher discount.
        //
        // "forever" rather than "once": on a subscription the customer should
        // keep paying the price they signed up at, so the discount repeats on
        // every renewal instead of the second invoice jumping to full price.
        const discounts = serverDiscount > 0
          ? [{ coupon: (await stripe.coupons.create({
              amount_off: Math.round(serverDiscount * 100),
              currency: "myr",
              duration: "forever",
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
