import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariation } from "@/lib/types";

/**
 * A cap on how many of one option may be sold.
 *
 * A package can be limited where the whole product is not: 配套 D is sixty
 * sets of a promotion, while the creams inside it go on being sold by
 * themselves afterwards. Stock cannot express that — the shelf holds bottles,
 * not promotions — so the limit belongs to the option the customer picks.
 *
 * Counted on paid orders, the same rule as a voucher's usage. A checkout that
 * was started and abandoned must not consume somebody else's set: on a shop
 * where a quarter of checkouts are abandoned, counting attempts would close
 * the promotion with a third of it unsold.
 *
 * The trade-off is the same one too. The count is of sales that completed, so
 * more people can be partway through checkout than there are sets left, and a
 * busy minute can carry it slightly past the cap. Overshooting by two or three
 * is the better failure: the alternative turns away a customer holding their
 * phone because of carts nobody ever paid for.
 */

export interface VariationAvailability {
  /** The cap the shop set, or null where the option is unlimited. */
  limit: number | null;
  /** Paid orders containing this option. */
  sold: number;
  /** null when unlimited. Never negative. */
  remaining: number | null;
  soldOut: boolean;
}

/**
 * How many paid orders hold this exact option.
 *
 * Matched by JSON containment on the order's own lines, so it reads what was
 * actually bought rather than re-deriving it from a name.
 */
export async function countPaidForVariation(
  db: SupabaseClient,
  variation: string,
  since?: string | null,
): Promise<number> {
  if (!variation) return 0;

  let query = db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid")
    .filter("items", "cs", JSON.stringify([{ variation }]));

  // Only sales made since the cap was set. Raising a limit from 60 to 100 is
  // a decision about the next 100, not a recount of everything ever sold.
  if (since) query = query.gte("created_at", since);

  const { count, error } = await query;

  if (error) {
    console.error(`[Limits] Could not count sales of "${variation}":`, error.message);
    // An unknown count must not be read as room left; the caller treats
    // Infinity as "cannot confirm there is any".
    return Number.POSITIVE_INFINITY;
  }
  return count || 0;
}

/** The cap a variation carries, or null where it has none. */
export function limitOf(variation: ProductVariation | undefined): number | null {
  const raw = Number(variation?.max_orders);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

/**
 * Where every limited option of a product stands.
 *
 * Only the limited ones are counted. A product whose options are all unlimited
 * costs nothing to ask about, which is almost all of them.
 */
export async function availabilityFor(
  db: SupabaseClient,
  variations: ProductVariation[] | null | undefined,
): Promise<Record<string, VariationAvailability>> {
  const out: Record<string, VariationAvailability> = {};

  for (const variation of variations || []) {
    const limit = limitOf(variation);
    if (limit === null) continue;

    const sold = await countPaidForVariation(db, variation.name, variation.max_orders_from);
    const remaining = Number.isFinite(sold) ? Math.max(0, limit - sold) : 0;
    out[variation.name] = {
      limit,
      sold: Number.isFinite(sold) ? sold : limit,
      remaining,
      soldOut: remaining <= 0,
    };
  }

  return out;
}

/**
 * Whether this option can still be bought, asked at the moment of checkout.
 *
 * Separate from the listing above because the two have different jobs: the
 * listing describes a page, this decides an order, and only the second one has
 * to be right at the instant it is asked.
 */
export async function variationIsAvailable(
  db: SupabaseClient,
  variations: ProductVariation[] | null | undefined,
  name: string,
): Promise<{ ok: boolean; remaining?: number }> {
  const variation = (variations || []).find((v) => v.name === name);
  const limit = limitOf(variation);
  if (limit === null) return { ok: true };

  const sold = await countPaidForVariation(db, name, variation?.max_orders_from);
  const remaining = Number.isFinite(sold) ? Math.max(0, limit - sold) : 0;
  return { ok: remaining > 0, remaining };
}
