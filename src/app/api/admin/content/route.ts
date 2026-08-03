import {
  DESIGNER_PRODUCT_FIELDS,
  getAdminSession,
  getSupabase,
  hasPermission,
} from "@/lib/admin-auth";

/**
 * Server-side writes for admin-managed content.
 *
 * These tables used to be written straight from the browser with the public
 * anon key, which meant anyone could rewrite them — including product prices,
 * which checkout trusts when verifying totals. Writes now go through here so
 * they carry a signed admin session, and the tables can be locked with RLS.
 *
 * Only the tables below are writable, and only with the columns each role is
 * allowed to touch.
 */
const WRITABLE_TABLES = ["products", "faqs", "testimonials", "hero_banners", "site_settings"] as const;
type Table = (typeof WRITABLE_TABLES)[number];

function isWritable(table: unknown): table is Table {
  return typeof table === "string" && (WRITABLE_TABLES as readonly string[]).includes(table);
}

/**
 * Designers may edit copy and imagery, never anything that changes what a
 * customer pays. Restricting by allow-list means a new pricing column is
 * excluded by default rather than accidentally exposed.
 */
function fieldsAllowedFor(table: Table, role: string): string[] | null {
  if (role === "super_admin") return null; // no restriction
  if (role !== "designer") return [];      // viewers write nothing

  if (table === "products") return DESIGNER_PRODUCT_FIELDS;
  return null; // FAQs, testimonials, banners and site images are content
}

function filterFields(data: Record<string, unknown>, allowed: string[] | null) {
  if (allowed === null) return data;
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in data) out[key] = data[key];
  return out;
}

async function authorise(table: unknown) {
  const session = await getAdminSession();
  if (!session) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!isWritable(table)) {
    return { error: Response.json({ error: "That table cannot be edited here" }, { status: 400 }) };
  }

  const canWrite = hasPermission(session.role, "content.edit") || hasPermission(session.role, "*");
  if (!canWrite) {
    return { error: Response.json({ error: "Your role cannot edit content" }, { status: 403 }) };
  }

  return { session, table: table as Table };
}

export async function POST(request: Request) {
  const { table, data } = await request.json().catch(() => ({}));
  const auth = await authorise(table);
  if ("error" in auth) return auth.error;

  const allowed = fieldsAllowedFor(auth.table, auth.session.role);
  // Creating a record while only permitted some of its fields would produce a
  // half-formed row, so designers may edit but not create.
  if (allowed !== null) {
    return Response.json({ error: "Your role cannot create new records" }, { status: 403 });
  }

  const { data: created, error } = await getSupabase().from(auth.table).insert(data).select();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data: created });
}

export async function PUT(request: Request) {
  const { table, id, data, match } = await request.json().catch(() => ({}));
  const auth = await authorise(table);
  if ("error" in auth) return auth.error;

  const payload = filterFields(data || {}, fieldsAllowedFor(auth.table, auth.session.role));
  if (!Object.keys(payload).length) {
    return Response.json({ error: "Your role cannot edit those fields" }, { status: 403 });
  }

  const supabase = getSupabase();

  // site_settings is keyed by `key` and upserted; everything else by id.
  if (auth.table === "site_settings") {
    const { error } = await supabase.from("site_settings").upsert(payload, { onConflict: "key" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  }

  const column = match?.column === "key" ? "key" : "id";
  const value = match?.value ?? id;
  if (!value) return Response.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from(auth.table).update(payload).eq(column, value);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const id = searchParams.get("id");

  const auth = await authorise(table);
  if ("error" in auth) return auth.error;

  // Deleting is destructive and not part of editing content.
  if (auth.session.role !== "super_admin") {
    return Response.json({ error: "Only a Super Admin can delete records" }, { status: 403 });
  }
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const { error } = await getSupabase().from(auth.table).delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
