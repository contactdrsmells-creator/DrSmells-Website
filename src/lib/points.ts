import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Points, kept as a ledger rather than a running total.
 *
 * Every award and every spend is its own row, and a balance is their sum. A
 * single balance column drifts the first time two things happen at once or a
 * refund is handled by hand, and once it has drifted there is nothing to
 * recompute it from. Rows also make expiry possible, and let a customer — and
 * the owner — see exactly where a figure came from.
 */

export interface PointsRules {
  /** Points earned per RM1 spent. */
  earn_per_ringgit: number;
  /** Points needed for RM1 off. */
  points_per_ringgit: number;
  /** Fewest points a customer may redeem at once. */
  min_redeem: number;
  /** Months before unspent points lapse. 0 means never. */
  expiry_months: number;
  /** Awarded once, when the account is created. */
  signup_bonus: number;
  /** Whether customers can earn and spend at all. */
  enabled: boolean;
}

export const DEFAULT_RULES: PointsRules = {
  earn_per_ringgit: 1,
  points_per_ringgit: 20, // 100 points = RM5, i.e. 5% back
  min_redeem: 100,
  expiry_months: 12,
  signup_bonus: 50,
  enabled: true,
};

export async function getRules(db: SupabaseClient): Promise<PointsRules> {
  const { data } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "points")
    .maybeSingle();
  return { ...DEFAULT_RULES, ...(data?.value || {}) };
}

/**
 * What a customer has to spend.
 *
 * Expired rows are excluded here rather than deleted, so the history a
 * customer reads still explains where points went.
 */
export async function getBalance(db: SupabaseClient, customerId: string): Promise<number> {
  const { data } = await db
    .from("points_ledger")
    .select("delta, expires_at")
    .eq("customer_id", customerId);

  const now = Date.now();
  return (data || []).reduce((sum, row) => {
    const expired = row.expires_at && new Date(row.expires_at).getTime() < now && row.delta > 0;
    return expired ? sum : sum + Number(row.delta || 0);
  }, 0);
}

export async function getHistory(db: SupabaseClient, customerId: string, limit = 50) {
  const { data } = await db
    .from("points_ledger")
    .select("delta, reason, order_number, expires_at, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

function expiryFrom(months: number): string | null {
  if (!months) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * Awards the points an order earned.
 *
 * Keyed on the order number so a payment webhook that fires twice — which they
 * do — cannot pay the customer twice. The check is a read before a write
 * rather than a database constraint so that a missing unique index cannot turn
 * a duplicate award into a failed order.
 */
export async function awardForOrder(
  db: SupabaseClient,
  { customerId, orderNumber, spend }: { customerId: string; orderNumber: string; spend: number },
): Promise<{ awarded: number; skipped?: string }> {
  const rules = await getRules(db);
  if (!rules.enabled) return { awarded: 0, skipped: "points_disabled" };

  const { data: existing } = await db
    .from("points_ledger")
    .select("id")
    .eq("order_number", orderNumber)
    .gt("delta", 0)
    .maybeSingle();
  if (existing) return { awarded: 0, skipped: "already_awarded" };

  const points = Math.floor(Math.max(0, spend) * rules.earn_per_ringgit);
  if (points <= 0) return { awarded: 0, skipped: "nothing_to_award" };

  const { error } = await db.from("points_ledger").insert({
    customer_id: customerId,
    delta: points,
    reason: "order",
    order_number: orderNumber,
    expires_at: expiryFrom(rules.expiry_months),
  });
  if (error) return { awarded: 0, skipped: error.message };
  return { awarded: points };
}

/** What a number of points is worth in ringgit. */
export function pointsToRinggit(points: number, rules: PointsRules): number {
  if (!rules.points_per_ringgit) return 0;
  return Math.round((points / rules.points_per_ringgit) * 100) / 100;
}

/**
 * The most a customer may usefully put towards this order.
 *
 * Capped at the order's own value: points are a discount, never a payout, and
 * an order must not be able to go negative or settle at nothing through points
 * alone.
 */
export function redeemableFor(balance: number, orderTotal: number, rules: PointsRules): number {
  if (!rules.enabled || balance < rules.min_redeem) return 0;
  const maxByOrder = Math.floor(orderTotal * rules.points_per_ringgit);
  const usable = Math.min(balance, maxByOrder);
  return usable < rules.min_redeem ? 0 : usable;
}

/**
 * Spends points against an order.
 *
 * The balance is re-read here rather than trusted from the request: the
 * figure the browser shows was true when the page loaded, and an order placed
 * in two tabs would otherwise spend the same points twice.
 */
export async function spendForOrder(
  db: SupabaseClient,
  { customerId, orderNumber, points }: { customerId: string; orderNumber: string; points: number },
): Promise<{ spent: number; error?: string }> {
  const rules = await getRules(db);
  if (!rules.enabled) return { spent: 0, error: "points_disabled" };

  const wanted = Math.floor(points);
  if (wanted <= 0) return { spent: 0 };

  const balance = await getBalance(db, customerId);
  if (wanted > balance) return { spent: 0, error: "insufficient_points" };

  const { error } = await db.from("points_ledger").insert({
    customer_id: customerId,
    delta: -wanted,
    reason: "redeemed",
    order_number: orderNumber,
  });
  if (error) return { spent: 0, error: error.message };
  return { spent: wanted };
}

/** Puts points back when an order they paid for is cancelled or refunded. */
export async function refundForOrder(db: SupabaseClient, orderNumber: string) {
  const { data: rows } = await db
    .from("points_ledger")
    .select("id, customer_id, delta, reason")
    .eq("order_number", orderNumber);

  for (const row of rows || []) {
    const already = (rows || []).some(
      (r) => r.reason === "reversed" && r.delta === -row.delta,
    );
    if (row.reason === "reversed" || already) continue;
    await db.from("points_ledger").insert({
      customer_id: row.customer_id,
      delta: -row.delta,
      reason: "reversed",
      order_number: orderNumber,
    });
  }
}
