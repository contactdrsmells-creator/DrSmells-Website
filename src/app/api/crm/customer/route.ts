import { timingSafeEqual } from "crypto";
import { hashPassword, normalisePhone, supabaseAdmin } from "@/lib/customer-auth";

/**
 * Opens a shop account for somebody who bought over chat.
 *
 * A customer who orders through a salesperson never signs up, so their points
 * sit in a ledger nobody can reach and the loyalty scheme reaches only the
 * people who were already on the website. This makes the account for them at
 * the moment the order is taken, on the number they gave.
 *
 * No welcome bonus. That is paid for choosing to sign up, and nobody chose
 * anything here — paying it for an account the shop opened on their behalf
 * would hand out fifty points per order to people who never asked for one.
 *
 * The password starts as the mobile number, which is how they are told to log
 * in the first time. It is a weak secret by design and worth saying so: anyone
 * who knows the number can sign in until the customer changes it, and what
 * they would find is the order history and the points. Verified sign-in —
 * a WhatsApp code — is what properly closes that, and this is waiting on it.
 *
 * Behind the shared secret the two systems already use between them.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  // A number that is not a Malaysian mobile is not somebody to open an
  // account for. The marketplace imports book a day's trading as one order
  // with a dash where the phone goes, and this is where those stop.
  if (!phone) return Response.json({ created: false, reason: "not a usable mobile number" });

  const db = supabaseAdmin();

  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return Response.json({ created: false, reason: "already has an account", id: existing.id });

  const name = String(body?.name || "").trim().slice(0, 80) || null;
  const { data: created, error } = await db
    .from("customers")
    // The password is the number itself, normalised, so it is the same string
    // whatever the order was typed with — 012… and 6012… must both get in.
    .insert({ phone, name, password_hash: hashPassword(phone) })
    .select("id, phone, name")
    .single();

  if (error || !created) {
    // A second order for the same person arriving at the same moment loses
    // this race, which is the outcome wanted: one account, already made.
    const { data: raced } = await db
      .from("customers").select("id").eq("phone", phone).maybeSingle();
    if (raced) return Response.json({ created: false, reason: "already has an account", id: raced.id });
    console.error("[CRM] Could not open an account for", phone, error?.message);
    return Response.json({ error: "Could not create the account" }, { status: 500 });
  }

  console.log(`[CRM] Opened a shop account for ${phone}`);
  return Response.json({ created: true, id: created.id });
}
