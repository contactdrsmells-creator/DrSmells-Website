import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// Service role: site_settings is locked by RLS, so the public key cannot write.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

// Public: get payment settings (which gateways are enabled, shipping costs)
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "payment")
      .single();

    const settings = data?.value || {};

    // Only return public-safe fields
    return Response.json({
      stripe_enabled: settings.stripe_enabled === true || settings.stripe_enabled === "true",
      doku_enabled: settings.doku_enabled === true || settings.doku_enabled === "true",
      atome_enabled: settings.atome_enabled === true || settings.atome_enabled === "true",
      shipping_cost: settings.shipping_cost || "10.00",
      free_shipping_threshold: settings.free_shipping_threshold || "100.00",
      currency: settings.currency || "MYR",
    });
  } catch {
    return Response.json({
      stripe_enabled: false,
      doku_enabled: false,
      atome_enabled: false,
      shipping_cost: "10.00",
      free_shipping_threshold: "100.00",
      currency: "MYR",
    });
  }
}

// Admin: update payment settings
export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const supabase = getSupabase();

    const { error } = await supabase
      .from("site_settings")
      .upsert({
        key: "payment",
        value: {
          stripe_enabled: !!body.stripe_enabled,
          doku_enabled: !!body.doku_enabled,
          atome_enabled: !!body.atome_enabled,
          shipping_cost: body.shipping_cost || "10.00",
          free_shipping_threshold: body.free_shipping_threshold || "100.00",
          currency: body.currency || "MYR",
        },
      }, { onConflict: "key" });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
