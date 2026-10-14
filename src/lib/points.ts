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
 * Awards the points a batch of orders earned.
 *
 * Keyed on the order number, so a payment webhook that fires twice — which
 * they do — cannot pay the customer twice. The check is a read before a write
 * rather than a database constraint, so that a missing unique index cannot
 * turn a duplicate award into a failed order.
 *
 * Two queries whatever the number of orders. The account page sweeps every
 * order a customer has on each load, and asking the ledger about each one
 * separately meant a page waiting on dozens of round trips to award, almost
 * always, nothing at all: the common case is that every order has already been
 * paid for and the whole exchange was to confirm it.
 */
export async function awardForOrders(
  db: SupabaseClient,
  { customerId, orders }: { customerId: string; orders: { orderNumber: string; spend: number }[] },
): Promise<{ awarded: number; orders: number }> {
  const wanted = orders.filter((o) => o.orderNumber);
  if (!wanted.length) return { awarded: 0, orders: 0 };

  const rules = await getRules(db);
  if (!rules.enabled) return { awarded: 0, orders: 0 };

  // Which of these the ledger has already paid for. Keyed on the order number
  // alone, as the single-order path is, so an order reaching us twice through
  // different channels is still only paid for once.
  const { data: already } = await db
    .from("points_ledger")
    .select("order_number")
    .in("order_number", wanted.map((o) => o.orderNumber))
    .gt("delta", 0);

  const seen = new Set((already || []).map((row) => row.order_number));
  const expires = expiryFrom(rules.expiry_months);

  const rows = [];
  for (const order of wanted) {
    if (seen.has(order.orderNumber)) continue;
    // Marked as we go: the same order number twice in one batch is one award.
    seen.add(order.orderNumber);
    const points = Math.floor(Math.max(0, order.spend) * rules.earn_per_ringgit);
    if (points <= 0) continue;
    rows.push({
      customer_id: customerId,
      delta: points,
      reason: "order",
      order_number: order.orderNumber,
      expires_at: expires,
    });
  }

  if (!rows.length) return { awarded: 0, orders: 0 };

  const { error } = await db.from("points_ledger").insert(rows);
  if (error) {
    console.error("[Points] Could not award a batch:", error.message);
    return { awarded: 0, orders: 0 };
  }
  return { awarded: rows.reduce((sum, row) => sum + row.delta, 0), orders: rows.length };
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

/**
 * Points for what this customer bought on the shop's other channels.
 *
 * An order taken over chat is the same person buying, and lands in the CRM
 * rather than here. Matched on the mobile number, and only from the day the
 * account was opened: a number nobody has proved they own must not arrive
 * carrying a balance.
 *
 * Awarding is keyed on the order's id, and a website order carries the same id
 * in both systems — so an order that reaches here twice, once through the
 * shop and once through the CRM, is still only paid for once.
 */
export async function awardForOtherChannels(
  db: SupabaseClient,
  { customerId, phone, since }: { customerId: string; phone: string; since: string },
): Promise<{ awarded: number; orders: number }> {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return { awarded: 0, orders: 0 };

  // The orders webhook and this share a host; only the last path segment
  // differs, so the address is derived rather than configured twice.
  const endpoint = url.replace(/\/[^/]*$/, "/customer-orders");

  let orders: { order_id: string; amount: number }[] = [];
  try {
    const res = await fetch(
      `${endpoint}?phone=${encodeURIComponent(phone)}&since=${encodeURIComponent(since)}`,
      { headers: { "x-webhook-secret": secret } },
    );
    if (!res.ok) {
      console.error("[Points] Could not read the CRM's orders:", res.status);
      return { awarded: 0, orders: 0 };
    }
    orders = (await res.json())?.orders || [];
  } catch (err) {
    // The account page must still open when the CRM cannot be reached; the
    // points are simply picked up the next time it does.
    console.error("[Points] CRM unreachable:", (err as Error).message);
    return { awarded: 0, orders: 0 };
  }

  return awardForOrders(db, {
    customerId,
    orders: orders.map((order) => ({
      orderNumber: order.order_id,
      spend: Number(order.amount) || 0,
    })),
  });
}
