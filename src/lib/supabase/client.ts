import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const isConfigured =
  supabaseUrl !== "your_supabase_url_here" &&
  supabaseUrl !== "" &&
  supabaseUrl.startsWith("http");

// Create a real client only when properly configured
// Otherwise create a dummy that won't be used (sample data will be used instead)
export const supabase: SupabaseClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as SupabaseClient);

export { isConfigured };
