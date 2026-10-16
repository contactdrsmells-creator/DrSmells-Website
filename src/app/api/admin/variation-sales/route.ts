import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin-auth";
import { countPaidForVariation } from "@/lib/variation-limits";
import type { ProductVariation } from "@/lib/types";

/**
 * How many of each option have sold, for the admin product form.
 *
 * Every variation, not only the capped ones: the number is there to decide a
 * cap by, so it has to be on screen before one exists. Typing 85 into an
 * empty box should show at once that 61 have already gone.
 *
 * Separate from the shop's own availability endpoint, which deliberately
 * withholds counts until stock is nearly gone. This is the boss's view.
 */
export async function GET(request: Request) {
  const auth = await requirePermission("products.view");
  if (auth instanceof Response) return auth;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ sold: {} });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: product } = await db
    .from("products")
    .select("variations")
    .eq("id", id)
    .maybeSingle();
  if (!product) return Response.json({ sold: {} });

  const sold: Record<string, number> = {};
  for (const v of (product.variations || []) as ProductVariation[]) {
    if (!v?.name) continue;
    const n = await countPaidForVariation(db, v.name);
    sold[v.name] = Number.isFinite(n) ? n : 0;
  }
  return Response.json({ sold });
}
