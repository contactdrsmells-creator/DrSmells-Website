import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const { code, subtotal, has_subscription } = await request.json();

    if (!code?.trim()) {
      return Response.json({ valid: false, error: "Please enter a voucher code" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: voucher, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .single();

    if (error || !voucher) {
      return Response.json({ valid: false, error: "Invalid voucher code" });
    }

    const now = new Date();

    if (voucher.start_date && new Date(voucher.start_date) > now) {
      return Response.json({ valid: false, error: "This voucher is not active yet" });
    }

    if (voucher.end_date && new Date(voucher.end_date) < now) {
      return Response.json({ valid: false, error: "This voucher has expired" });
    }

    if (voucher.max_uses && voucher.used_count >= voucher.max_uses) {
      return Response.json({ valid: false, error: "This voucher has been fully redeemed" });
    }

    if (voucher.min_order_amount && subtotal < voucher.min_order_amount) {
      return Response.json({
        valid: false,
        error: `Minimum order of RM${voucher.min_order_amount.toFixed(2)} required`,
      });
    }

    if (has_subscription && !voucher.applicable_for_subscription) {
      return Response.json({
        valid: false,
        error: "This voucher is not applicable for subscription orders",
      });
    }

    return Response.json({
      valid: true,
      code: voucher.code,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      min_order_amount: voucher.min_order_amount,
      applicable_for_subscription: voucher.applicable_for_subscription ?? false,
      free_shipping: voucher.free_shipping ?? false,
    });
  } catch {
    return Response.json({ valid: false, error: "Failed to validate voucher" });
  }
}
