import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: Request) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reviews } = await request.json();

  if (!Array.isArray(reviews) || reviews.length === 0) {
    return Response.json({ error: "No reviews provided" }, { status: 400 });
  }

  if (reviews.length > 500) {
    return Response.json({ error: "Maximum 500 reviews per import" }, { status: 400 });
  }

  const db = getSupabase();

  // Validate and sanitize each review
  const validReviews = [];
  for (const r of reviews) {
    const name = String(r.name || "").trim().slice(0, 100);
    const email = String(r.email || "").trim().toLowerCase().slice(0, 200);
    const rating = Number(r.rating);
    const title = String(r.title || "").trim().slice(0, 200);
    const body = String(r.body || "").trim().slice(0, 2000);
    const product_id = String(r.product_id || "").trim();

    if (!name || !email || !product_id || isNaN(rating) || rating < 1 || rating > 5) {
      continue; // Skip invalid rows
    }

    // Parse images - handle semicolon-separated (CSV) or array (JSON)
    let images: string[] = [];
    if (Array.isArray(r.images)) {
      images = r.images.filter((url: unknown) => typeof url === "string").slice(0, 5);
    } else if (typeof r.images === "string" && r.images.trim()) {
      images = r.images.split(";").map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
    }

    validReviews.push({
      product_id,
      name,
      email,
      rating,
      title,
      body,
      images,
      verified: r.verified === true || r.verified === "true",
      approved: r.approved === true || r.approved === "true",
      ...(r.created_at ? { created_at: r.created_at } : {}),
    });
  }

  if (validReviews.length === 0) {
    return Response.json(
      { error: "No valid reviews found. Each review needs: name, email, product_id, rating (1-5)." },
      { status: 400 }
    );
  }

  const { error } = await db.from("reviews").insert(validReviews);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, count: validReviews.length });
}
