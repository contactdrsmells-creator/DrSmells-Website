import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How many times a voucher has actually been paid for.
 *
 * The vouchers.used_count column counted the wrong thing: it was incremented
 * when the order was created, before the customer reached the payment page, so
 * an abandoned checkout burned a use. On a shop where most checkouts are
 * abandoned it ran far ahead of real sales — and if a usage limit had been set,
 * abandoned carts would have exhausted the voucher for paying customers.
 *
 * Counting paid orders instead means the figure cannot drift from what
 * happened, and removes a read-then-write that lost a count whenever two
 * people checked out at the same moment.
 *
 * The trade-off is deliberate: a limit is now enforced against completed
 * sales, so more people can be mid-checkout with the code than the limit
 * allows. Overshooting a promotion slightly is the better failure than turning
 * away customers because of carts that were never paid for.
 */
export async function countPaidVoucherUses(
  supabase: SupabaseClient,
  code: string,
): Promise<number> {
  if (!code) return 0;

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid")
    // Case-insensitive: the same voucher typed in lower case is the same
    // voucher, and checkout stores whatever the customer entered.
    .ilike("voucher_code", code);

  if (error) {
    console.error(`[Voucher] Could not count uses of ${code}:`, error.message);
    // Reporting zero would let a spent voucher through; the caller treats an
    // unknown count as "cannot confirm there is room left".
    return Number.POSITIVE_INFINITY;
  }

  return count || 0;
}
