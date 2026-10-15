import { createClient } from "@supabase/supabase-js";
import { countPaidVoucherUses } from "@/lib/voucher-usage";
import { voucherWindow } from "@/lib/voucher-dates";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const { code, subtotal, has_subscription } = await request.json();

    if (!code?.trim()) {
      return Response.json({ valid: false, error: "Please enter a voucher code" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Spaces are stripped, not just trimmed. People read "EMMELEY10" off a
    // poster and type "EMMELEY 10", and being told a code they were given is
    // invalid reads as the shop's mistake rather than a typo.
    const typed = String(code).replace(/\s+/g, "").toUpperCase();

    // Looked up without the active filter, so a code that exists but cannot
    // be used can say which of those two it is. Folding them together told a
    // customer holding a real, spent code that it was never a code at all.
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("*")
      .ilike("code", typed)
      .maybeSingle();

    if (!voucher) {
      return Response.json({ valid: false, error: "Invalid voucher code" });
    }

    if (!voucher.active) {
      return Response.json({
        valid: false,
        error: "This voucher is no longer available",
      });
    }

    // Both ends inclusive, and read as days in Malaysia. The message names
    // the date, since "not active yet" leaves the only useful fact unsaid.
    const dates = voucherWindow(voucher.start_date, voucher.end_date);
    if (!dates.ok) {
      return Response.json({ valid: false, error: dates.error });
    }

    // Counted from paid orders, so a limit is spent by sales rather than by
    // people who applied the code and never paid.
    if (voucher.max_uses && (await countPaidVoucherUses(supabase, voucher.code)) >= voucher.max_uses) {
      return Response.json({ valid: false, error: "This voucher is fully redeemed" });
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
