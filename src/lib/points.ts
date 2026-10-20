import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/paged";

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

export interface LedgerRow {
  delta: number;
  reason: string;
  expires_at: string | null;
}

/**
 * Every row against a customer, read once.
 *
 * The balance and the lifetime total are two sums over the same rows, and the
 * account page needs both — asking twice is a second round trip for figures
 * already in hand.
 */
export async function getLedger(db: SupabaseClient, customerId: string): Promise<LedgerRow[]> {
  const { data } = await db
    .from("points_ledger")
    .select("delta, reason, expires_at")
    .eq("customer_id", customerId);
  return (data || []) as LedgerRow[];
}

/**
 * What a customer has to spend.
 *
 * Expired rows are excluded here rather than deleted, so the history a
 * customer reads still explains where points went.
 */
export function balanceFrom(rows: LedgerRow[]): number {
  const now = Date.now();
  return rows.reduce((sum, row) => {
    const expired = row.expires_at && new Date(row.expires_at).getTime() < now && row.delta > 0;
    return expired ? sum : sum + Number(row.delta || 0);
  }, 0);
}

/**
 * What they have earned by buying, ever.
 *
 * Only awards for orders, and expiry is ignored: a tier records what somebody
 * has bought from us, which letting points lapse does not undo. Spending them
 * does not undo it either, so redemptions are not subtracted.
 */
export function lifetimeEarnedFrom(rows: LedgerRow[]): number {
  return rows.reduce(
    (sum, row) => (row.reason === "order" && row.delta > 0 ? sum + Number(row.delta) : sum),
    0,
  );
}

export async function getBalance(db: SupabaseClient, customerId: string): Promise<number> {
  return balanceFrom(await getLedger(db, customerId));
}

/**
 * Every customer's balance, in one read of the ledger.
 *
 * The admin screen asked for five hundred balances by calling getBalance five
 * hundred times, each its own round trip. It took seconds when the shop was
 * small and stopped finishing at all as the ledger grew — the page sat on its
 * spinner for ever, because a failed load there returns quietly and leaves it
 * spinning.
 *
 * One pass, summed in memory. A customer with no rows is absent from the
 * ledger rather than zero in it, so the caller treats a missing id as nought.
 */
export async function getBalances(
  db: SupabaseClient,
  customerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!customerIds.length) return out;

  const rows = await readAll<LedgerRow & { customer_id: string }>(
    (from, to) =>
      db
        .from("points_ledger")
        .select("customer_id, delta, reason, expires_at")
        .in("customer_id", customerIds)
        .range(from, to),
    { what: "points ledger" },
  );

  const byCustomer = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const list = byCustomer.get(row.customer_id);
    if (list) list.push(row);
    else byCustomer.set(row.customer_id, [row]);
  }
  for (const [id, list] of byCustomer) out.set(id, balanceFrom(list));
  return out;
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
  {
    customerId,
    orders,
    multiplier = 1,
  }: {
    customerId: string;
    orders: { orderNumber: string; spend: number }[];
    /** The member tier's earn rate. 1 is the ordinary rate. */
    multiplier?: number;
  },
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
    // The tier's multiplier is what makes a tier worth having. A missing or
    // nonsensical one falls back to the ordinary rate rather than to nothing.
    const rate = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    const points = Math.floor(Math.max(0, order.spend) * rules.earn_per_ringgit * rate);
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
    // The check above reads before it writes, so two requests arriving
    // together — a gateway's webhook and the payment checker, or one webhook
    // retried — both saw an unpaid order and both awarded it. Order 2047WNS
    // was credited 452 points twice in the same minute, and 2047WYT 322.
    //
    // A unique index on the order number now refuses the second write, and
    // this is where that refusal lands. It means the points were already
    // awarded, which is the outcome wanted, so it is not an error to report.
    if (error.code === "23505") {
      console.warn("[Points] Award already recorded for these orders, ignoring the duplicate");
      return { awarded: 0, orders: 0 };
    }
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
/** Statuses that mean the sale did not stand. */
export const CANCELLED = new Set(["cancelled", "refunded", "returned", "failed"]);

/**
 * Takes back the points awarded for orders that did not stand.
 *
 * refundForOrder was written and never called, so a cancelled order kept its
 * points for ever: somebody could order, be credited, cancel, and spend those
 * points on the next thing.
 *
 * Reversed rather than deleted, so the customer's history still explains where
 * the points went, and guarded so running twice does not take them twice.
 * Returns whether anything changed, which saves the caller a second read.
 */
export async function reverseForCancelled(
  db: SupabaseClient,
  orderNumbers: string[],
): Promise<boolean> {
  if (!orderNumbers.length) return false;

  const { data: rows } = await db
    .from("points_ledger")
    .select("id, customer_id, delta, reason, order_number")
    .in("order_number", orderNumbers);

  if (!rows?.length) return false;

  // What has already been taken back, so a second run is a no-op.
  const undone = new Set(
    rows.filter((r) => r.reason === "reversed").map((r) => `${r.order_number}|${-r.delta}`),
  );

  const toInsert = rows
    .filter((r) => r.reason === "order" && r.delta > 0 && !undone.has(`${r.order_number}|${r.delta}`))
    .map((r) => ({
      customer_id: r.customer_id,
      delta: -r.delta,
      reason: "reversed",
      order_number: r.order_number,
    }));

  if (!toInsert.length) return false;

  const { error } = await db.from("points_ledger").insert(toInsert);
  if (error) {
    console.error("[Points] Could not reverse awards for cancelled orders:", error.message);
    return false;
  }
  console.warn(
    `[Points] Reversed ${toInsert.length} award(s) for cancelled orders: ${[...new Set(toInsert.map((r) => r.order_number))].join(", ")}`,
  );
  return true;
}

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
  {
    customerId,
    phone,
    since,
    multiplier = 1,
  }: { customerId: string; phone: string; since: string; multiplier?: number },
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

  // Chat orders awarded earlier that the CRM no longer lists as live. The feed
  // leaves out anything cancelled, refunded or returned, so an order that was
  // paid for once and is absent now is one that did not stand — and its points
  // would otherwise sit in the balance for ever.
  const live = new Set(orders.map((o) => o.order_id));
  const { data: awardedRows } = await db
    .from("points_ledger")
    .select("order_number")
    .eq("customer_id", customerId)
    .eq("reason", "order")
    .gt("delta", 0);

  const goneQuiet = (awardedRows || [])
    .map((r) => r.order_number as string)
    // Only the CRM's own ids: a website order is not in this feed by design.
    .filter((n) => n?.startsWith("ORD-") && !live.has(n));

  if (goneQuiet.length) await reverseForCancelled(db, goneQuiet);

  return awardForOrders(db, {
    customerId,
    multiplier,
    orders: orders.map((order) => ({
      orderNumber: order.order_id,
      spend: Number(order.amount) || 0,
    })),
  });
}
