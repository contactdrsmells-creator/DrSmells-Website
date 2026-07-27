import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

    // Server-side price verification
    let verifiedTotal = 0;
    for (const item of items) {
      const { data: product } = await supabase
        .from("products")
        .select("price, sale_price, variations")
        .eq("id", item.product_id)
        .single();

      if (!product) {
        return Response.json({ error: `Product not found: ${item.product_name}` }, { status: 400 });
      }

      const variation = (product.variations || []).find((v: { name: string; price: number; sale_price?: number | null }) => v.name === item.variation);
      const serverPrice = variation
        ? (variation.sale_price ?? variation.price)
        : (product.sale_price ?? product.price);

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
          serverDiscount = voucher.discount_type === "percentage"
            ? Math.min(verifiedTotal * (voucher.discount_value / 100), verifiedTotal)
            : Math.min(voucher.discount_value, verifiedTotal);

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

        if (serverDiscount > 0) {
          lineItems.push({
            price_data: {
              currency: "myr",
              product_data: { name: "Discount" },
              unit_amount: Math.round(serverDiscount * -100),
            },
            quantity: 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: lineItems,
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
          .update({ payment_reference: session.id })
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

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: lineItems,
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
          .update({ payment_reference: session.id })
          .eq("id", order.id);

        redirect_url = session.url || "";
      }
    } else if (payment_method === "doku") {
      const dokuClientId = process.env.DOKU_CLIENT_ID;
      const dokuSecretKey = process.env.DOKU_SECRET_KEY;

      if (!dokuClientId || !dokuSecretKey) {
        return Response.json({ error: "DOKU not configured" }, { status: 500 });
      }

      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const dokuBaseUrl = process.env.DOKU_API_URL || "https://api-sandbox.doku.com";
      const timestamp = new Date().toISOString();
      const checkoutId = crypto.randomUUID();

      const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const dokuBody = {
        id: checkoutId,
        order: {
          amount: serverTotal,
          invoice_number: orderNumber,
          currency: "MYR",
          expired_at: expiredAt,
          line_items: items.map((item: { product_name: string; quantity: number; unit_price: number }) => ({
            name: item.product_name,
            quantity: item.quantity,
            price: item.unit_price,
          })),
        },
        customer: {
          name: shipping.name,
          email: shipping.email,
          phone: shipping.phone,
          country: "MY",
          address: `${shipping.address_line1}${shipping.address_line2 ? ", " + shipping.address_line2 : ""}, ${shipping.city}, ${shipping.state} ${shipping.postcode}`,
        },
        checkout_experience: {
          language: "EN",
          auto_redirect: true,
          callback_url: `${origin}/api/webhooks/doku`,
          callback_url_cancel: `${origin}/checkout`,
          callback_url_result: `${origin}/order-confirmation?order=${orderNumber}`,
        },
      };

      const authorization = Buffer.from(`${dokuClientId}:${dokuSecretKey}`).toString("base64");

      const dokuRes = await fetch(`${dokuBaseUrl}/v3/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authorization}`,
          "Client-Id": dokuClientId,
          "Request-Timestamp": timestamp,
          "API-Version": "arabica.2025-12-01",
        },
        body: JSON.stringify(dokuBody),
      });

      if (!dokuRes.ok) {
        const errData = await dokuRes.json().catch(() => ({}));
        console.error("DOKU checkout error:", errData);
        return Response.json({ error: "Failed to create DOKU checkout" }, { status: 500 });
      }

      const dokuData = await dokuRes.json();

      await supabase
        .from("orders")
        .update({ payment_reference: checkoutId })
        .eq("id", order.id);

      redirect_url = dokuData.payment?.checkout_url || "";
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
