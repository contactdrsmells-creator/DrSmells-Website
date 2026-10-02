import { requirePermission } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/customer-auth";
import { DEFAULT_RULES, getBalance, getRules } from "@/lib/points";

/** The rules, plus every customer with their balance, for the admin screen. */
export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const db = supabaseAdmin();
  const rules = await getRules(db);

  const { data: customers } = await db
    .from("customers")
    .select("id, phone, name, created_at, last_login_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const withBalances = [];
  for (const c of customers || []) {
    withBalances.push({ ...c, balance: await getBalance(db, c.id) });
  }

  return Response.json({ rules, customers: withBalances });
}

/** Saves the rules. Unknown keys are dropped rather than stored. */
export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const clean: Record<string, number | boolean> = {};
  for (const key of Object.keys(DEFAULT_RULES) as (keyof typeof DEFAULT_RULES)[]) {
    const value = body[key];
    if (key === "enabled") clean[key] = Boolean(value);
    else if (Number.isFinite(Number(value))) clean[key] = Math.max(0, Number(value));
  }

  const db = supabaseAdmin();
  const { error } = await db.from("site_settings").upsert(
    { key: "points", value: clean, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, rules: clean });
}

/**
 * A manual adjustment, written as its own ledger row with a reason.
 *
 * Nothing edits or deletes an existing row: a correction is another entry, so
 * what the customer was given and why stays readable afterwards.
 */
export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { customer_id, delta, note } = await request.json().catch(() => ({}));
  const amount = Math.trunc(Number(delta));
  if (!customer_id || !Number.isFinite(amount) || amount === 0) {
    return Response.json({ error: "Enter an amount to add or take away" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from("points_ledger").insert({
    customer_id,
    delta: amount,
    reason: "manual",
    note: String(note || "").slice(0, 200) || null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, balance: await getBalance(db, customer_id) });
}
