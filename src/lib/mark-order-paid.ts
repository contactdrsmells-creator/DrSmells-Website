import type { SupabaseClient } from "@supabase/supabase-js";
import { reportPurchaseToMeta } from "@/lib/meta-capi";

/**
 * Marks an order paid, and never lets an optional field take the core fields
 * down with it.
 *
 * Postgres rejects the whole UPDATE if any column is unknown, so adding
 * stripe_subscription_id to a table that lacked the column silently wiped out
 * the status change too: subscription orders sat at "pending" while the money
 * had arrived. The error was also unchecked, so nothing surfaced.
 *
 * The essential fields are applied first on their own; the extras are a second,
 * best-effort write.
 *
 * This is also where the sale is reported to Meta. Putting it here rather than
 * at each call site is deliberate: a payment path that forgets to report is
 * invisible — the money arrives, the order ships, and only Ads Manager quietly
 * disagrees. Any future way of marking an order paid gets reporting for free.
 */
export async function markOrderPaid(
  supabase: SupabaseClient,
  orderNumber: string,
  essential: Record<string, string>,
  optional: Record<string, string> = {},
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update(essential)
    .eq("order_number", orderNumber);

  if (error) {
    console.error(`[Order] Failed to mark ${orderNumber} paid:`, error.message);
    return;
  }

  const extras = Object.entries(optional).filter(([, v]) => v !== undefined && v !== null);

  if (extras.length) {
    const { error: optionalError } = await supabase
      .from("orders")
      .update(Object.fromEntries(extras))
      .eq("order_number", orderNumber);

    // Logged, not thrown: the payment is already recorded, and a missing
    // reference column must not make the webhook look like it failed.
    if (optionalError) {
      console.error(
        `[Order] ${orderNumber} marked paid, but optional fields (${extras.map(([k]) => k).join(", ")}) failed:`,
        optionalError.message,
      );
    }
  }

  // Reporting is caught rather than awaited into the caller's error path — an
  // ad platform being unreachable must never fail a payment webhook, which
  // would leave the gateway retrying a payment that is already recorded.
  await reportPurchaseToMeta(supabase, orderNumber).catch((err: Error) =>
    console.error(`[MetaCAPI] Unexpected error reporting ${orderNumber}:`, err.message),
  );
}
