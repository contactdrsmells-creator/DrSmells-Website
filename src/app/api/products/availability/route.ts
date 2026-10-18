import { createClient } from "@supabase/supabase-js";
import { availabilityFor } from "@/lib/variation-limits";

/**
 * How many of each limited option are left, for the shop page.
 *
 * Public, and deliberately says only what a shopper may see: which options are
 * gone and how many remain. It does not report sales of options that carry no
 * limit, which is nobody's business but ours.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return Response.json({ availability: {} });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );

  const { data: product } = await db
    .from("products")
    .select("variations")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) return Response.json({ availability: {} });

  const availability = await availabilityFor(db, product.variations);

  /**
   * The exact count is sent only once it is small.
   *
   * Above the threshold the page says the run is limited and no more, and the
   * number does not travel either — a figure withheld from the page but left
   * in its data is not withheld at all, it is just one tap of a browser's
   * inspector away. Below it, the number is the point: "9 units available" is
   * what moves somebody who has been thinking about it.
   */
  const SHOW_COUNT_AT_OR_BELOW = 15;

  const trimmed: Record<string, { limited: true; soldOut: boolean; remaining: number | null }> = {};
  for (const [name, a] of Object.entries(availability)) {
    const left = a.remaining ?? 0;
    trimmed[name] = {
      limited: true,
      soldOut: a.soldOut,
      remaining: left <= SHOW_COUNT_AT_OR_BELOW ? left : null,
    };
  }
  // Served from the edge for half a minute, and for a further two while a
  // fresh copy is fetched behind the request. The shop's own checkout decides
  // what may actually be sold, so a figure thirty seconds old on a page costs
  // nothing — and during a rush, where this matters most, it is the difference
  // between every visitor waiting for the same answer and almost none of them
  // waiting at all.
  return Response.json(
    { availability: trimmed },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
