import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Only allow images
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Only JPG, PNG, and WebP images allowed." }, { status: 400 });
  }

  // 5MB max for review images
  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Image too large. Maximum 5MB." }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "public", "reviews");
  await mkdir(uploadDir, { recursive: true });

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
  const fileName = `${safeName}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  return Response.json({ success: true, url: `/reviews/${fileName}` });
}
