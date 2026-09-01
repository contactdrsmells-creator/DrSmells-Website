import { createClient } from "@supabase/supabase-js";
import { syncOrderToCRM } from "@/lib/crm-sync";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/mark-order-paid";
import { getAtomePayment } from "@/lib/atome";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Atome's status callback.
 *
 * The body carries only { referenceId } — no status, no amount — and even if
 * it carried more it would not be believed: anyone can POST JSON at a public
 * URL. The referenceId is treated purely as a doorbell. What the order becomes
 * is decided by asking Atome over our own authenticated connection, so a
 * forged callback can at worst make us look up a payment.
 *
 * The referenceId is the order number, set that way at creation.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const referenceId = body?.referenceId;

    if (!referenceId || !/^[0-9a-zA-Z-_]{1,40}$/.test(referenceId)) {
      return Response.json({ error: "Missing referenceId" }, { status: 400 });
    }

    let payment;
    try {
      payment = await getAtomePayment(referenceId);
    } catch (err) {
      console.error(`[Atome] Could not verify ${referenceId}:`, (err as Error).message);
      // 500 on purpose: Atome retries failed callbacks, and a payment we could
      // not verify right now is worth being asked about again.
      return Response.json({ error: "Could not verify payment" }, { status: 500 });
    }

    const supabase = getSupabase();

    if (payment.status === "PAID") {
      // Same path as every other gateway, so Meta reporting, CRM sync and the
      // confirmation email cannot be forgotten by this one.
      await markOrderPaid(
        supabase,
        referenceId,
        {
          status: "paid",
          payment_status: "paid",
          updated_at: new Date().toISOString(),
        },
        { payment_reference: payment.transactionId || referenceId },
      );

      await syncOrderToCRM(referenceId).catch((err) =>
        console.error("[CRM Sync] Error in Atome webhook:", err)
      );

      await sendOrderConfirmationEmail(referenceId);
    } else if (payment.status === "FAILED" || payment.status === "CANCELLED") {
      // Back to pending so the unpaid-order reminders pick it up — and guarded
      // so a stale notification cannot undo a payment that has succeeded.
      await supabase
        .from("orders")
        .update({
          status: "pending",
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("order_number", referenceId)
        .neq("payment_status", "paid");
    }
    // PROCESSING and REFUNDED change nothing here: one is still in flight, and
    // refunds are handled by a person in the CRM, not by a status flip.

    return Response.json({ success: true });
  } catch (err) {
    console.error("Atome webhook error:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

/** A person landing here belongs on the site, not on raw JSON. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const order = url.searchParams.get("order");
  if (order) {
    return Response.redirect(`${url.origin}/order-confirmation?order=${order}`);
  }
  return Response.redirect(url.origin, 302);
}
