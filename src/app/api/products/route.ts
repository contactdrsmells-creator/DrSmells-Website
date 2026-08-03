import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const auth = await requirePermission("products.write");
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, price, sale_price, variations, variation_attributes, variation_combos, in_stock, image_url")
    .eq("in_stock", true)
    .order("name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ products: data || [] });
}
