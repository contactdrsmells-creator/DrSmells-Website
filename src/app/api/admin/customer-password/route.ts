import { randomInt } from "crypto";
import { requirePermission } from "@/lib/admin-auth";
import { hashPassword, supabaseAdmin } from "@/lib/customer-auth";

/**
 * A temporary password for a customer who has forgotten theirs.
 *
 * Until WhatsApp codes are live there is no way for a customer to get back in
 * on their own, and no way for the shop to help them — which leaves a customer
 * locked out of points they have earned, and a conversation nobody can end.
 *
 * The new password is shown once, to the owner, to pass on. It is never stored
 * in the clear and never written to a log: what comes back from here is the
 * only copy, and after this reply it exists nowhere but the customer's hands.
 */

/** Easy to read aloud and to type: no O/0, no I/l/1. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function temporaryPassword(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { customer_id } = await request.json().catch(() => ({}));
  if (!customer_id) {
    return Response.json({ error: "Which customer?" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select("id, phone, name")
    .eq("id", customer_id)
    .maybeSingle();
  if (!customer) return Response.json({ error: "No such customer" }, { status: 404 });

  const password = temporaryPassword();
  const { error } = await db
    .from("customers")
    .update({
      password_hash: hashPassword(password),
      // Any lock from failed attempts is cleared: the customer is about to be
      // given a password that works, and should not meet a locked door.
      login_attempts: 0,
      locked_until: null,
    })
    .eq("id", customer_id);

  if (error) return Response.json({ error: "Could not reset the password" }, { status: 500 });

  return Response.json({
    ok: true,
    phone: customer.phone,
    name: customer.name,
    password,
    note: "Shown once. Pass it to the customer and ask them to change it on their account page.",
  });
}
