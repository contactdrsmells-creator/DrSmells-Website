import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fields a voucher may not have a column for yet.
 *
 * Postgres rejects an entire statement if any column in it is unknown, so
 * naming a field added by a migration that has not been run would take the
 * whole save down with it — somebody editing a date gets "could not find the
 * description column" and loses the edit, for a field they never touched.
 *
 * This repository has made that mistake once before, with
 * stripe_subscription_id, and in the same way: the fix then was to write the
 * optional field on its own, and it is the fix now. The voucher saves either
 * way, and the extra field lands as soon as the column exists.
 */
async function writeOptional(
  supabase: ReturnType<typeof getSupabase>,
  id: string,
  body: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("vouchers")
    .update({
      show_in_account: body.show_in_account === true,
      description: String(body.description || "").trim().slice(0, 120) || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[Vouchers] Could not store the member-account fields:", error.message);
  }
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

  const { data, error } = await supabase
    .from("vouchers")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) await writeOptional(supabase, data.id, body);

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

  await writeOptional(supabase, body.id, body);

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
