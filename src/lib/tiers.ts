import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Membership tiers.
 *
 * A tier is earned by buying, and the thing it changes is how fast points
 * accrue — so the reward for being a good customer is itself worth something
 * rather than being a word on a card.
 *
 * Measured in points earned from orders, not in ringgit. Points already count
 * every channel: an order taken over WhatsApp awards them the same way the shop
 * does, so a customer who buys mostly over chat climbs at the same rate as one
 * who only ever uses the website. A ringgit total read from this database would
 * see only half of what they spend with us.
 *
 * Signup bonuses and manual adjustments are left out. A tier should say how
 * much somebody has bought, and a gift from us is not that.
 */

export interface MemberTier {
  id: string;
  name: string;
  /** Points earned from orders before this tier is reached. */
  min_points: number;
  /** Points per ringgit are multiplied by this. 1 is the ordinary rate. */
  earn_multiplier: number;
  benefits: string | null;
  /** Hex colour for the badge, so each tier can look like itself. */
  colour: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TierStanding {
  current: MemberTier | null;
  next: MemberTier | null;
  earned: number;
  /** Points still needed for the next tier, or 0 at the top. */
  toNext: number;
  /** How far through the current tier, 0–1, for the progress bar. */
  progress: number;
}

/** The ladder, lowest first. Inactive tiers are left out of the climb. */
export async function getTiers(db: SupabaseClient): Promise<MemberTier[]> {
  const { data, error } = await db
    .from("member_tiers")
    .select("*")
    .eq("is_active", true)
    .order("min_points", { ascending: true });

  if (error) {
    // A shop without tiers configured is the ordinary case, not a failure, and
    // the account page must still open.
    console.error("[Tiers] Could not read tiers:", error.message);
    return [];
  }
  return (data || []) as MemberTier[];
}

/** Where this customer stands on the ladder. */
export function standingFor(earned: number, tiers: MemberTier[]): TierStanding {
  if (!tiers.length) return { current: null, next: null, earned, toNext: 0, progress: 0 };

  // The highest tier whose threshold they have passed.
  let current: MemberTier | null = null;
  for (const tier of tiers) {
    if (earned >= tier.min_points) current = tier;
    else break;
  }

  const next = tiers.find((t) => t.min_points > earned) || null;
  if (!next) return { current, next: null, earned, toNext: 0, progress: 1 };

  const floor = current?.min_points ?? 0;
  const span = Math.max(1, next.min_points - floor);
  return {
    current,
    next,
    earned,
    toNext: Math.max(0, next.min_points - earned),
    progress: Math.min(1, Math.max(0, (earned - floor) / span)),
  };
}

/** What this customer's tier does to the rate they earn at. */
export function multiplierFor(earned: number, tiers: MemberTier[]): number {
  const { current } = standingFor(earned, tiers);
  const multiplier = Number(current?.earn_multiplier ?? 1);
  // A broken or missing figure must never stop points being awarded, and must
  // never multiply them by nothing.
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}
