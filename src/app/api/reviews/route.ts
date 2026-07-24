import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET — public: fetch approved reviews for a product
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");
  const all = searchParams.get("all"); // admin: get all reviews

  const db = getSupabase();

  // Admin wants all reviews
  if (all === "true") {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token");
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await db
      .from("reviews")
      .select("*, products:product_id(name, slug)")
      .order("created_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  // Public: approved reviews for a product
  if (!productId) {
    return Response.json({ error: "product_id required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("approved", true)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST — public: submit a new review
export async function POST(request: Request) {
  const body = await request.json();
  const { product_id, name, email, rating, title, body: reviewBody, images } = body;

  // Validate required fields
  if (!product_id || !name || !email || !rating || !reviewBody) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return Response.json({ error: "Rating must be 1-5" }, { status: 400 });
  }

  if (typeof name !== "string" || name.length > 100) {
    return Response.json({ error: "Invalid name" }, { status: 400 });
  }

  if (typeof email !== "string" || !email.includes("@") || email.length > 200) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  if (typeof reviewBody !== "string" || reviewBody.length > 2000) {
    return Response.json({ error: "Review too long (max 2000 chars)" }, { status: 400 });
  }

  // Sanitize images array
  const safeImages = Array.isArray(images)
    ? images.filter((url: unknown) => typeof url === "string" && url.startsWith("/reviews/")).slice(0, 5)
    : [];

  const db = getSupabase();

  const { data, error } = await db
    .from("reviews")
    .insert({
      product_id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      rating,
      title: (title || "").trim().slice(0, 200),
      body: reviewBody.trim(),
      images: safeImages,
      verified: false,
      approved: false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, review: data });
}

// PATCH — admin: approve/reject/delete reviews
export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, approved, verified } = await request.json();
  if (!id) return Response.json({ error: "Review id required" }, { status: 400 });

  const db = getSupabase();
  const updates: Record<string, boolean> = {};
  if (typeof approved === "boolean") updates.approved = approved;
  if (typeof verified === "boolean") updates.verified = verified;

  const { error } = await db.from("reviews").update(updates).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

// DELETE — admin: delete a review
export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Review id required" }, { status: 400 });

  const db = getSupabase();
  const { error } = await db.from("reviews").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
