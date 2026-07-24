import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// SenangPay return URL (redirect back after payment)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status_id = url.searchParams.get("status_id");
  const order_id = url.searchParams.get("order_id");
  const transaction_id = url.searchParams.get("transaction_id");
  const msg = url.searchParams.get("msg");
  const hash = url.searchParams.get("hash");

  const secretKey = process.env.SENANGPAY_SECRET_KEY || "";

  // Verify hash: secretkey + status_id + order_id + transaction_id + msg
  const hashString = secretKey + status_id + order_id + transaction_id + msg;
  const expectedHash = createHmac("sha256", secretKey).update(hashString).digest("hex");

  if (hash !== expectedHash) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return Response.redirect(`${origin}/order-confirmation?order=${order_id}&error=invalid_hash`);
  }

  const supabase = getSupabase();

  if (status_id === "1") {
    // Payment successful
    await supabase
      .from("orders")
      .update({
        status: "paid",
        payment_status: "paid",
        payment_reference: transaction_id,
        updated_at: new Date().toISOString(),
      })
      .eq("order_number", order_id);
  } else {
    // Payment failed
    await supabase
      .from("orders")
      .update({
        payment_status: "failed",
        payment_reference: transaction_id,
        updated_at: new Date().toISOString(),
      })
      .eq("order_number", order_id);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return Response.redirect(`${origin}/order-confirmation?order=${order_id}`);
}

// SenangPay callback URL (server-to-server notification)
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const status_id = formData.get("status_id")?.toString() || "";
    const order_id = formData.get("order_id")?.toString() || "";
    const transaction_id = formData.get("transaction_id")?.toString() || "";
    const msg = formData.get("msg")?.toString() || "";
    const hash = formData.get("hash")?.toString() || "";

    const secretKey = process.env.SENANGPAY_SECRET_KEY || "";

    // Verify hash
    const hashString = secretKey + status_id + order_id + transaction_id + msg;
    const expectedHash = createHmac("sha256", secretKey).update(hashString).digest("hex");

    if (hash !== expectedHash) {
      return Response.json({ error: "Invalid hash" }, { status: 400 });
    }

    const supabase = getSupabase();

    if (status_id === "1") {
      await supabase
        .from("orders")
        .update({
          status: "paid",
          payment_status: "paid",
          payment_reference: transaction_id,
          updated_at: new Date().toISOString(),
        })
        .eq("order_number", order_id);
    } else {
      await supabase
        .from("orders")
        .update({
          payment_status: "failed",
          payment_reference: transaction_id,
          updated_at: new Date().toISOString(),
        })
        .eq("order_number", order_id);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("SenangPay callback error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
