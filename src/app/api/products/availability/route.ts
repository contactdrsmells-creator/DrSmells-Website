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
  const trimmed: Record<string, { remaining: number; soldOut: boolean }> = {};
  for (const [name, a] of Object.entries(availability)) {
    trimmed[name] = { remaining: a.remaining ?? 0, soldOut: a.soldOut };
  }
  return Response.json({ availability: trimmed });
}
