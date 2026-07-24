import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  // Check auth
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "images";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
    "video/mp4", "video/webm", "video/quicktime",
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Invalid file type. Use JPG, PNG, WebP, GIF, SVG, MP4, or WebM." }, { status: 400 });
  }

  // Validate file size (50MB max for videos, 10MB for images)
  const isVideo = file.type.startsWith("video/");
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return Response.json({ error: `File too large. Maximum ${isVideo ? "50MB" : "10MB"}.` }, { status: 400 });
  }

  // Sanitize folder name
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const uploadDir = path.join(process.cwd(), "public", safeFolder);

  await mkdir(uploadDir, { recursive: true });

  // Generate safe filename
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
  const fileName = `${safeName}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  // Write file
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const publicUrl = `/${safeFolder}/${fileName}`;

  return Response.json({ success: true, url: publicUrl, fileName });
}
