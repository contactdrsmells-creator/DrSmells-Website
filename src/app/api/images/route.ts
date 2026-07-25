import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const BUCKET = "uploads";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "products";
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(safeFolder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    return Response.json({ images: [] });
  }

  const images = (files || [])
    .filter((f) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name))
    .map((f) => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`${safeFolder}/${f.name}`);
      return {
        fileName: f.name,
        url: urlData.publicUrl,
      };
    });

  return Response.json({ images });
}
