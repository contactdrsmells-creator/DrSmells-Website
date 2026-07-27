import { createClient } from "@supabase/supabase-js";
import { syncOrderToCRM } from "@/lib/crm-sync";
import { sendOrderConfirmationEmail } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const { session_id, order_number } = await request.json();

    if (!session_id || !order_number) {
      return Response.json({ error: "Missing parameters" }, { status: 400 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return Response.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.metadata?.order_number !== order_number) {
      return Response.json({ error: "Order mismatch" }, { status: 400 });
    }

    if (session.payment_status === "paid") {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: order } = await supabase
        .from("orders")
        .select("status")
        .eq("order_number", order_number)
        .single();

      if (order && order.status !== "paid") {
        const updateData: Record<string, string> = {
          status: "paid",
          payment_status: "paid",
          payment_reference: (session.payment_intent as string) || session.id,
          updated_at: new Date().toISOString(),
        };
        if (session.subscription) {
          updateData.stripe_subscription_id = session.subscription as string;
        }

        await supabase
          .from("orders")
          .update(updateData)
          .eq("order_number", order_number);

        await syncOrderToCRM(order_number).catch((err) =>
          console.error("[CRM Sync] Error in Stripe verify:", err)
        );

        await sendOrderConfirmationEmail(order_number);
      }

      return Response.json({ status: "paid" });
    }

    return Response.json({ status: session.payment_status });
  } catch (err) {
    console.error("Stripe session verify error:", err);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
