import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const BUCKET = "uploads";

export async function POST(request: Request) {
  const auth = await requirePermission("media.upload");
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "images";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
    "video/mp4", "video/webm", "video/quicktime",
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Invalid file type. Use JPG, PNG, WebP, GIF, SVG, MP4, or WebM." }, { status: 400 });
  }

  const isVideo = file.type.startsWith("video/");
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return Response.json({ error: `File too large. Maximum ${isVideo ? "50MB" : "10MB"}.` }, { status: 400 });
  }

  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
  const fileName = `${safeFolder}/${safeName}-${Date.now()}.${ext}`;

  const supabase = getSupabase();

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Supabase storage upload error:", uploadError);
    return Response.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return Response.json({ success: true, url: urlData.publicUrl, fileName });
}
