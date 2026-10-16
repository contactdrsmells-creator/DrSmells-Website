import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";
import { availabilityFor } from "@/lib/variation-limits";

/**
 * How many of each capped option have sold, for the admin product form.
 *
 * Separate from the shop's own availability endpoint, which deliberately
 * withholds the count until stock is nearly gone. Here the whole point is to
 * see it — "19/100" is what tells the boss whether a promotion is moving.
 */
export async function GET(request: Request) {
  const auth = await requirePermission("products.view");
  if (auth instanceof Response) return auth;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ sales: {} });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: product } = await db
    .from("products")
    .select("variations")
    .eq("id", id)
    .maybeSingle();
  if (!product) return Response.json({ sales: {} });

  const availability = await availabilityFor(db, product.variations);
  const sales: Record<string, { sold: number; limit: number }> = {};
  for (const [name, a] of Object.entries(availability)) {
    sales[name] = { sold: a.sold, limit: a.limit ?? 0 };
  }
  return Response.json({ sales });
}
