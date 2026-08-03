import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("vouchers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ vouchers: data || [] });
}

export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const supabase = getSupabase();

  const { error } = await supabase.from("vouchers").insert({
    code: body.code?.toUpperCase()?.trim(),
    discount_type: body.discount_type || "percentage",
    discount_value: parseFloat(body.discount_value) || 0,
    min_order_amount: parseFloat(body.min_order_amount) || 0,
    max_uses: parseInt(body.max_uses) || null,
    used_count: 0,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    active: body.active !== false,
    applicable_for_subscription: body.applicable_for_subscription === true,
    free_shipping: body.free_shipping === true,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("vouchers")
    .update({
      code: body.code?.toUpperCase()?.trim(),
      discount_type: body.discount_type,
      discount_value: parseFloat(body.discount_value) || 0,
      min_order_amount: parseFloat(body.min_order_amount) || 0,
      max_uses: body.max_uses ? parseInt(body.max_uses) : null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      active: body.active !== false,
      applicable_for_subscription: body.applicable_for_subscription === true,
      free_shipping: body.free_shipping === true,
    })
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Missing voucher ID" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("vouchers").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
