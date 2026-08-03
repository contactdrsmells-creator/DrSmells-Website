import { requirePermission } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Accepts the plain YYYY-MM-DD the export produces, and still tolerates a full
 * timestamp from older files. Anything unparseable returns null so the row is
 * inserted with the current time rather than a bad date — a spreadsheet that
 * silently reformats a column shouldn't corrupt review history.
 */
function parseImportDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Date-only: pin to midday UTC so the calendar date can't shift a day either
  // way once rendered in Malaysia's timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T12:00:00Z`);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: Request) {
  // Auth check
  const auth = await requirePermission("reviews.manage");
  if (auth instanceof Response) return auth;

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

    // Email is optional on import — imported reviews often come from sources
    // that never captured one. The column is NOT NULL, so an empty string
    // stands in. Reviews submitted on the site still require a valid email.
    if (!name || !product_id || isNaN(rating) || rating < 1 || rating > 5) {
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
      ...(parseImportDate(r.created_at) ? { created_at: parseImportDate(r.created_at) } : {}),
    });
  }

  if (validReviews.length === 0) {
    return Response.json(
      { error: "No valid reviews found. Each review needs: name, product_id, rating (1-5). Email is optional." },
      { status: 400 }
    );
  }

  const { error } = await db.from("reviews").insert(validReviews);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, count: validReviews.length });
}
