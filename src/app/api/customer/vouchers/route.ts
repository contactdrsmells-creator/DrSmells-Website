import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";
import { countPaidVoucherUses } from "@/lib/voucher-usage";
import { voucherWindow } from "@/lib/voucher-dates";

/**
 * The vouchers a member can actually use today.
 *
 * Only those the shop has chosen to publish. A voucher code is a thing of
 * value, and most of them exist to be given to a particular person or posted
 * in a particular campaign — listing every row in the table would hand an
 * influencer's code, or a one-off apology discount, to everyone who logs in.
 * So a voucher appears here because somebody ticked a box, never by default.
 *
 * Expired, not-yet-started and fully redeemed codes are filtered out rather
 * than shown greyed: a wallet of vouchers that cannot be used is worse than an
 * empty one.
 */
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ vouchers: [] }, { status: 401 });

  const db = supabaseAdmin();
  const now = new Date();

  const { data, error } = await db
    .from("vouchers")
    .select("*")
    .eq("active", true)
    .eq("show_in_account", true)
    .order("created_at", { ascending: false });

  if (error) {
    // The column is added by a migration; without it the member area should
    // show no vouchers rather than an error.
    console.error("[Vouchers] Could not read the customer's vouchers:", error.message);
    return Response.json({ vouchers: [] });
  }

  // Which of these this customer has already spent, so a used code is not
  // dangled in front of them a second time.
  const { data: theirOrders } = await db
    .from("orders")
    .select("voucher_code")
    .eq("customer_id", session.id)
    .eq("payment_status", "paid");
  const spent = new Set(
    (theirOrders || []).map((o) => String(o.voucher_code || "").toUpperCase()).filter(Boolean),
  );

  const usable = [];
  for (const voucher of data || []) {
    if (!voucherWindow(voucher.start_date, voucher.end_date, now).ok) continue;
    if (voucher.max_uses && (await countPaidVoucherUses(db, voucher.code)) >= voucher.max_uses) continue;

    usable.push({
      code: voucher.code,
      description: voucher.description || null,
      discount_type: voucher.discount_type,
      discount_value: Number(voucher.discount_value) || 0,
      min_order_amount: Number(voucher.min_order_amount) || 0,
      free_shipping: Boolean(voucher.free_shipping),
      applicable_for_subscription: Boolean(voucher.applicable_for_subscription),
      end_date: voucher.end_date,
      used_by_you: spent.has(String(voucher.code).toUpperCase()),
    });
  }

  return Response.json({ vouchers: usable });
}
