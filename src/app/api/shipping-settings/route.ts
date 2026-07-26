import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

export interface ShippingZone {
  id: string;
  name: string;
  states: string[];
  flat_rate: number;
  free_shipping_min: number;
}

const DEFAULT_ZONES: ShippingZone[] = [
  {
    id: "west-malaysia",
    name: "West Malaysia",
    states: [
      "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Melaka",
      "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis",
      "Putrajaya", "Selangor", "Terengganu",
    ],
    flat_rate: 10,
    free_shipping_min: 100,
  },
  {
    id: "east-malaysia",
    name: "East Malaysia",
    states: ["Sabah", "Sarawak", "Labuan"],
    flat_rate: 15,
    free_shipping_min: 150,
  },
];

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "shipping")
      .single();

    const settings = data?.value || {};
    return Response.json({
      zones: settings.zones || DEFAULT_ZONES,
    });
  } catch {
    return Response.json({ zones: DEFAULT_ZONES });
  }
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = getSupabase();

    const { error } = await supabase
      .from("site_settings")
      .upsert({
        key: "shipping",
        value: { zones: body.zones || DEFAULT_ZONES },
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
