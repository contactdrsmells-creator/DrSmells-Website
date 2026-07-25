import { createClient } from "@supabase/supabase-js";
import { syncOrderToCRM } from "@/lib/crm-sync";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// DOKU sends callback notifications via POST
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // DOKU callback contains order and payment info
    const invoiceNumber = body?.order?.invoice_number;
    const paymentStatus = body?.payment?.status; // SUCCESS, PENDING, FAILED, EXPIRED
    const transactionId = body?.payment?.transaction_id || body?.id || "";

    if (!invoiceNumber) {
      return Response.json({ error: "Missing invoice number" }, { status: 400 });
    }

    const supabase = getSupabase();

    if (paymentStatus === "SUCCESS" || paymentStatus === "COMPLETED") {
      await supabase
        .from("orders")
        .update({
          status: "paid",
          payment_status: "paid",
          payment_reference: transactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("order_number", invoiceNumber);

      // Sync paid order to CRM
      await syncOrderToCRM(invoiceNumber).catch((err) =>
        console.error("[CRM Sync] Error in DOKU webhook:", err)
      );
    } else if (paymentStatus === "FAILED" || paymentStatus === "EXPIRED") {
      await supabase
        .from("orders")
        .update({
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("order_number", invoiceNumber);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("DOKU webhook error:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// DOKU may also redirect via GET for result callbacks
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceNumber = searchParams.get("invoice_number") || searchParams.get("order");

  if (invoiceNumber) {
    // Redirect to order confirmation
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return Response.redirect(`${origin}/order-confirmation?order=${invoiceNumber}`);
  }

  return Response.json({ error: "Missing order reference" }, { status: 400 });
}
