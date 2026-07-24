import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: { order_number?: string }; payment_intent?: string; id?: string };
      const orderNumber = session.metadata?.order_number;

      if (orderNumber) {
        const supabase = getSupabase();
        await supabase
          .from("orders")
          .update({
            status: "paid",
            payment_status: "paid",
            payment_reference: (session.payment_intent as string) || session.id,
            updated_at: new Date().toISOString(),
          })
          .eq("order_number", orderNumber);
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return Response.json({ error: "Webhook verification failed" }, { status: 400 });
  }
}
