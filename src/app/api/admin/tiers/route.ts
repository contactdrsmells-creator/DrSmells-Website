import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

/**
 * The membership ladder, as the shop defines it.
 *
 * Every figure a member sees on their account page is set here — the names,
 * the thresholds, what each tier is worth and what it promises — so nothing
 * about tiers is written into the code where only a deploy could change it.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Everything a tier may hold, taken from a request and made safe. */
type TierFields = {
  name: string;
  min_points: number;
  earn_multiplier: number;
  benefits: string | null;
  colour: string | null;
  sort_order: number;
  is_active: boolean;
};

function cleanTier(body: Record<string, unknown>): { error: string; value?: never } | { error?: never; value: TierFields } {
  const name = String(body.name || "").trim().slice(0, 60);
  if (!name) return { error: "Give the tier a name" };

  const minPoints = Number(body.min_points);
  if (!Number.isFinite(minPoints) || minPoints < 0 || minPoints > 10_000_000) {
    return { error: "The points needed must be a number of 0 or more" };
  }

  const multiplier = Number(body.earn_multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10) {
    return { error: "The earn rate must be between 0 and 10" };
  }

  const colour = String(body.colour || "").trim();
  if (colour && !HEX.test(colour)) return { error: "The colour must be a hex code like #2B3A1B" };

  return {
    value: {
      name,
      min_points: Math.round(minPoints),
      earn_multiplier: Math.round(multiplier * 100) / 100,
      benefits: String(body.benefits || "").trim().slice(0, 500) || null,
      colour: colour || null,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      is_active: body.is_active !== false,
    },
  };
}

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { data, error } = await getSupabase()
    .from("member_tiers")
    .select("*")
    .order("min_points", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tiers: data || [] });
}

export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const cleaned = cleanTier(await request.json());
  if (!cleaned.value) return Response.json({ error: cleaned.error }, { status: 400 });

  const { data, error } = await getSupabase()
    .from("member_tiers")
    .insert(cleaned.value)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tier: data });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json();
  if (!body.id) return Response.json({ error: "Which tier?" }, { status: 400 });

  const cleaned = cleanTier(body);
  if (!cleaned.value) return Response.json({ error: cleaned.error }, { status: 400 });

  const { data, error } = await getSupabase()
    .from("member_tiers")
    .update(cleaned.value)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tier: data });
}

export async function DELETE(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Which tier?" }, { status: 400 });

  const { error } = await getSupabase().from("member_tiers").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
