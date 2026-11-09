import { timingSafeEqual } from "crypto";
import { normalisePhone, supabaseAdmin } from "@/lib/customer-auth";
import { balanceFrom, getHistory, getLedger } from "@/lib/points";

/**
 * One customer's points, and the moving of them, for the CRM.
 *
 * Whoever is answering a customer is in the CRM, not here. They are the one
 * being asked why a balance is what it is, and the one who agrees to put
 * something right — so they need to read the history and to add or take away
 * without being sent to a second system with a second password.
 *
 * Read and write in one route because they are one conversation: every
 * adjustment answers with the balance and the history it produced, so the
 * page showing it cannot drift from the ledger.
 *
 * Nothing edits or deletes an existing row. A correction is another entry,
 * which is what keeps the history worth reading, and every manual row records
 * who made it.
 *
 * Behind the shared secret the two systems already use between them.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The biggest single adjustment anyone can make by hand. */
const MAX_ADJUSTMENT = 100_000;

export async function POST(request: Request) {
  const expected = process.env.CRM_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!secretMatches(request.headers.get("x-webhook-secret"), expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const phone = normalisePhone(String(body?.phone || ""));
  if (!phone) return Response.json({ error: "A phone number is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select("id, name, created_at")
    .eq("phone", phone)
    .maybeSingle();

  // No account is an ordinary answer: most people who buy over chat have
  // never signed up, and there is nothing to show or to adjust.
  if (!customer) return Response.json({ found: false });

  // An adjustment, when one was asked for. Read-only otherwise.
  if (body?.delta !== undefined && body?.delta !== null && body?.delta !== "") {
    const delta = Math.trunc(Number(body.delta));
    if (!Number.isFinite(delta) || delta === 0) {
      return Response.json({ error: "Enter an amount to add or take away" }, { status: 400 });
    }
    if (Math.abs(delta) > MAX_ADJUSTMENT) {
      return Response.json(
        { error: `That is more than ${MAX_ADJUSTMENT.toLocaleString()} points in one go` },
        { status: 400 },
      );
    }

    // Taking away more than they hold would leave a balance below nought,
    // which nothing else in the shop can produce and no screen expects.
    const held = balanceFrom(await getLedger(db, customer.id));
    if (delta < 0 && held + delta < 0) {
      return Response.json(
        { error: `They only have ${held.toLocaleString()} points` },
        { status: 400 },
      );
    }

    const actor = String(body?.by || "").trim().slice(0, 80) || "CRM";
    const { error } = await db.from("points_ledger").insert({
      customer_id: customer.id,
      delta,
      reason: "manual",
      note: String(body?.note || "").trim().slice(0, 200) || null,
      actor,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const ledger = await getLedger(db, customer.id);
  return Response.json({
    found: true,
    name: customer.name,
    joined: customer.created_at,
    points: balanceFrom(ledger),
    history: await getHistory(db, customer.id, 50),
  });
}
