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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Names compared the way a person means them, not the way they were typed. */
const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

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

  // Which products exist, so a row can be checked before it is sent rather
  // than after Postgres has thrown out the whole file because of it.
  const { data: products } = await db.from("products").select("id, name, slug");
  const byId = new Set((products || []).map((p) => p.id));
  const byName = new Map<string, string>();
  for (const p of products || []) {
    byName.set(fold(p.name), p.id);
    if (p.slug) byName.set(fold(p.slug), p.id);
  }

  /**
   * The product a row is about.
   *
   * The id is preferred and the name is the fallback, because the export
   * writes both and a spreadsheet damages the id far more easily: a
   * find-and-replace meant for the body text reaches into a column of
   * hexadecimal and quietly turns a valid id into one character too many.
   * The name survives that, and is the column a person was editing anyway.
   */
  const productFor = (row: Record<string, unknown>): string | null => {
    const id = String(row.product_id || "").trim();
    if (UUID.test(id) && byId.has(id)) return id;
    const name = fold(String(row.product || row.product_name || ""));
    return (name && byName.get(name)) || null;
  };

  // Validate and sanitize each review
  const validReviews = [];
  const skipped = { product: 0, fields: 0 };
  for (const r of reviews) {
    const name = String(r.name || "").trim().slice(0, 100);
    const email = String(r.email || "").trim().toLowerCase().slice(0, 200);
    const rating = Number(r.rating);
    const title = String(r.title || "").trim().slice(0, 200);
    const body = String(r.body || "").trim().slice(0, 2000);
    const product_id = productFor(r);

    // Email is optional on import — imported reviews often come from sources
    // that never captured one. The column is NOT NULL, so an empty string
    // stands in. Reviews submitted on the site still require a valid email.
    if (!product_id) { skipped.product += 1; continue; }
    if (!name || isNaN(rating) || rating < 1 || rating > 5) { skipped.fields += 1; continue; }

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
    const why = skipped.product
      ? `No row named a product we recognise. Check the "product" column matches a product name exactly, or that "product_id" was not altered.`
      : "Each review needs a name, a product and a rating of 1 to 5. Email is optional.";
    return Response.json({ error: why }, { status: 400 });
  }

  // One row at a time would be slower; one statement means a single bad row
  // takes the whole file with it. Inserted in chunks so a failure costs a
  // hundred rows rather than five hundred, and the rest still land.
  let inserted = 0;
  const failures: string[] = [];
  for (let i = 0; i < validReviews.length; i += 100) {
    const chunk = validReviews.slice(i, i + 100);
    const { error } = await db.from("reviews").insert(chunk);
    if (error) failures.push(error.message);
    else inserted += chunk.length;
  }

  if (!inserted) {
    return Response.json({ error: failures[0] || "Nothing could be imported" }, { status: 500 });
  }

  return Response.json({
    success: true,
    count: inserted,
    skipped: skipped.product + skipped.fields,
    skipped_product: skipped.product,
    skipped_fields: skipped.fields,
    partial: failures.length ? failures[0] : undefined,
  });
}
