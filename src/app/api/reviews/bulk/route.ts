import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Applies one action to many reviews at once. Admin only. */
const ACTIONS = {
  approve: { approved: true },
  hide: { approved: false },
  verify: { verified: true },
  unverify: { verified: false },
} as const;

type Action = keyof typeof ACTIONS | "delete";

// Bounded so a single request can't try to rewrite the whole table; the client
// splits larger selections into chunks.
const MAX_IDS = 500;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!cookieStore.get("admin_token")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = String(body.action || "") as Action;
  if (action !== "delete" && !(action in ACTIONS)) {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  // Only well-formed ids — anything else is dropped rather than passed to the DB.
  const ids = Array.isArray(body.ids)
    ? body.ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    : [];

  if (!ids.length) {
    return Response.json({ error: "No reviews selected" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return Response.json({ error: `Maximum ${MAX_IDS} reviews per request` }, { status: 400 });
  }

  const db = getSupabase();

  if (action === "delete") {
    const { error, count } = await db
      .from("reviews")
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, affected: count ?? ids.length });
  }

  const { error, count } = await db
    .from("reviews")
    .update(ACTIONS[action], { count: "exact" })
    .in("id", ids);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, affected: count ?? ids.length });
}
