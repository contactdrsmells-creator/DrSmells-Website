import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function generateOrderNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DS-${datePart}-${rand}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, shipping, payment_method, subtotal, shipping_cost, total, source, has_subscription } = body;

    // Validate required fields
    if (!items?.length || !shipping?.name || !shipping?.email || !shipping?.phone) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["senangpay", "stripe", "doku"].includes(payment_method)) {
      return Response.json({ error: "Invalid payment method" }, { status: 400 });
    }

    // Server-side price verification
    const supabase = getSupabase();
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

    // Get payment settings for shipping cost verification
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "payment")
      .single();

    const paySettings = settingsRow?.value || {};
    const serverShippingCost = verifiedTotal >= parseFloat(paySettings.free_shipping_threshold || "100")
      ? 0
      : parseFloat(paySettings.shipping_cost || "10");
    const serverTotal = verifiedTotal + serverShippingCost;

    // Allow small floating point differences
    if (Math.abs(serverTotal - total) > 0.02) {
      return Response.json({ error: "Price mismatch. Please refresh and try again." }, { status: 400 });
    }

    // Create order
    const orderNumber = generateOrderNumber();
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

    if (payment_method === "senangpay") {
      const merchantId = process.env.SENANGPAY_MERCHANT_ID;
      const secretKey = process.env.SENANGPAY_SECRET_KEY;

      if (!merchantId || !secretKey) {
        return Response.json({ error: "SenangPay not configured" }, { status: 500 });
      }

      const amountStr = serverTotal.toFixed(2);
      const detail = `Dr.Smells Order ${orderNumber}`;
      const name = shipping.name;
      const email = shipping.email;
      const phone = shipping.phone;

      // SenangPay HMAC-SHA256: secretkey + detail + amount + order_id
      const hashString = secretKey + detail + amountStr + orderNumber;
      const hash = createHmac("sha256", secretKey).update(hashString).digest("hex");

      const senangpayUrl = process.env.SENANGPAY_URL || "https://app.senangpay.my/payment";
      const params = new URLSearchParams({
        detail,
        amount: amountStr,
        order_id: orderNumber,
        name,
        email,
        phone,
        hash,
      });

      redirect_url = `${senangpayUrl}/${merchantId}?${params.toString()}`;
    } else if (payment_method === "stripe") {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return Response.json({ error: "Stripe not configured" }, { status: 500 });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeSecretKey);

      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      // Separate subscription and one-time items
      const subscriptionItems = items.filter((item: { subscription?: { interval_months: number } }) => item.subscription);
      const onetimeItems = items.filter((item: { subscription?: { interval_months: number } }) => !item.subscription);

      if (has_subscription && subscriptionItems.length > 0) {
        // Stripe Checkout in subscription mode
        const subLineItems = subscriptionItems.map((item: { product_name: string; quantity: number; variation: string; subscription: { interval_months: number; price: number } }) => ({
          price_data: {
            currency: "myr" as const,
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
        }));

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: subLineItems,
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
        // Standard one-time Stripe payment
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

      // Set expiry to 24 hours from now
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

      const authorization = Buffer.from(dokuSecretKey).toString("base64");

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

      // Save DOKU checkout ID as payment reference
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
