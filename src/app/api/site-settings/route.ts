import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  try {
    if (!supabaseUrl || supabaseUrl === "your_supabase_url_here") {
      return Response.json({
        brand: { name: "Dr.Smells", tagline: "Simple . Effective . 100hrs", mission: "Your skin, our mission - smell like you", company: "LIFE BIO LAB SDN. BHD (1452572-P)" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from("site_settings").select("*");

    const settings: Record<string, Record<string, string>> = {};
    data?.forEach((row: { key: string; value: Record<string, string> }) => {
      settings[row.key] = row.value;
    });

    return Response.json(settings);
  } catch {
    return Response.json({
      brand: { name: "Dr.Smells", tagline: "Simple . Effective . 100hrs", mission: "Your skin, our mission - smell like you", company: "LIFE BIO LAB SDN. BHD (1452572-P)" },
    });
  }
}
