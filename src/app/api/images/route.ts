import { cookies } from "next/headers";
import { readdir } from "fs/promises";
import path from "path";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "products";
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(process.cwd(), "public", safeFolder);

  try {
    const files = await readdir(dir);
    const images = files
      .filter((f) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f))
      .map((f) => ({
        fileName: f,
        url: `/${safeFolder}/${f}`,
      }));
    return Response.json({ images });
  } catch {
    return Response.json({ images: [] });
  }
}
