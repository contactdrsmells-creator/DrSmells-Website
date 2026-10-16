import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariation } from "@/lib/types";
import { readAll } from "@/lib/paged";

/**
 * A cap on how many of one option may be sold.
 *
 * A package can be limited where the whole product is not: 配套 D is sixty
 * sets of a promotion, while the creams inside it go on being sold by
 * themselves afterwards. Stock cannot express that — the shelf holds bottles,
 * not promotions — so the limit belongs to the option the customer picks.
 *
 * Counted in units on paid orders, the same rule as a voucher's usage. A
 * checkout that was started and abandoned must not consume somebody else's
 * set: on a shop where a quarter of checkouts are abandoned, counting attempts
 * would close the promotion with a third of it unsold.
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
  /** Units of this option on paid orders — quantities, not orders. */
  sold: number;
  /** null when unlimited. Never negative. */
  remaining: number | null;
  soldOut: boolean;
}

/**
 * Sales of these options that the shop never saw.
 *
 * An order taken over WhatsApp lives in the CRM and nowhere else, so a cap
 * counted from this database alone oversells by however many went through
 * chat — 配套 B read 247 here when 256 had actually gone.
 *
 * Asked once for every option rather than once each, and a failure answers
 * zero rather than throwing: a CRM that cannot be reached should make a cap
 * slightly generous, never stop the shop from selling.
 */
export async function chatSalesFor(variations: string[]): Promise<Record<string, number>> {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret || !variations.length) return {};

  // Shares a host with the other webhooks; only the last segment differs.
  const endpoint = url.replace(/\/[^/]*$/, "/variation-sales");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
      body: JSON.stringify({ variations }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error("[Limits] CRM refused the variation count:", res.status);
      return {};
    }
    return (await res.json())?.sold || {};
  } catch (err) {
    console.error("[Limits] CRM unreachable for variation counts:", (err as Error).message);
    return {};
  }
}

/**
 * How many of this option were sold on paid orders.
 *
 * Counted in units, not in orders. Somebody buying five refill packs takes
 * five off a cap of fifty, and counting the order instead of its quantity read
 * that as one — a cap of fifty would have let through far more than fifty.
 *
 * Narrowed by JSON containment first so only orders that actually hold this
 * option are read, then summed from their own lines: containment can say an
 * order contains the option but not how many of it.
 */
export async function countPaidForVariation(
  db: SupabaseClient,
  variation: string,
): Promise<number> {
  if (!variation) return 0;

  let rows: { items: unknown }[];
  try {
    rows = await readAll<{ items: unknown }>(
      (from, to) =>
        db
          .from("orders")
          .select("items")
          .eq("payment_status", "paid")
          .filter("items", "cs", JSON.stringify([{ variation }]))
          .range(from, to),
      { what: `sales of "${variation}"` },
    );
  } catch (err) {
    console.error(`[Limits] Could not count sales of "${variation}":`, (err as Error).message);
    // An unknown count must not be read as room left; the caller treats
    // Infinity as "cannot confirm there is any".
    return Number.POSITIVE_INFINITY;
  }

  let units = 0;
  for (const row of rows) {
    const lines = Array.isArray(row.items) ? (row.items as { variation?: string; quantity?: unknown }[]) : [];
    for (const line of lines) {
      if (line?.variation !== variation) continue;
      // A line that somehow carries no quantity is still one of them sold.
      const quantity = Number(line.quantity);
      units += Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    }
  }
  return units;
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

  const capped = (variations || []).filter((v) => limitOf(v) !== null);
  // One round trip for all of them, not one each.
  const chat = await chatSalesFor(capped.map((v) => v.name));

  for (const variation of capped) {
    const limit = limitOf(variation)!;

    const own = await countPaidForVariation(db, variation.name);
    const sold = Number.isFinite(own) ? own + (chat[variation.name] || 0) : own;
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
 *
 * Asked about a quantity rather than about emptiness. "Is there any left" let
 * a basket of ten through on the last remaining set, which is the one case a
 * cap exists to stop.
 */
export async function variationIsAvailable(
  db: SupabaseClient,
  variations: ProductVariation[] | null | undefined,
  name: string,
  wanted = 1,
): Promise<{ ok: boolean; remaining?: number }> {
  const variation = (variations || []).find((v) => v.name === name);
  const limit = limitOf(variation);
  if (limit === null) return { ok: true };

  const own = await countPaidForVariation(db, name);
  const chat = (await chatSalesFor([name]))[name] || 0;
  const sold = Number.isFinite(own) ? own + chat : own;
  const remaining = Number.isFinite(sold) ? Math.max(0, limit - sold) : 0;
  const asked = Number.isFinite(wanted) && wanted > 0 ? Math.floor(wanted) : 1;
  return { ok: remaining >= asked, remaining };
}
