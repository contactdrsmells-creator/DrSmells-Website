import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, PASSWORD_HINT_COOKIE, cookieOptions, createCustomerToken,
  getCustomerSession, hashPassword, supabaseAdmin,
} from "@/lib/customer-auth";

/**
 * Setting a new password.
 *
 * Only the signed-in account may change its own, and signing in is the proof:
 * a customer who has forgotten their password gets here by the WhatsApp code,
 * which establishes the number is theirs. There is deliberately no reset link
 * by email — the account has no verified email to send one to.
 *
 * A code sign-in must come here before anything else: its session is refused
 * everywhere until a password is saved, and saving one lifts that.
 */

/** Whether this browser's session still owes a password. */
export async function GET() {
  const session = await getCustomerSession({ allowPending: true });
  const pending = !!session?.mustSetPassword;
  if (!pending) {
    const store = await cookies();
    if (store.get(PASSWORD_HINT_COOKIE)) {
      store.set(PASSWORD_HINT_COOKIE, "", { ...cookieOptions(0), httpOnly: false });
    }
  }
  return Response.json(
    { must_set_password: pending, name: session?.name || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getCustomerSession({ allowPending: true });
  if (!session) return Response.json({ error: "Please log in first" }, { status: 401 });

  const { password } = await request.json().catch(() => ({}));
  const value = String(password || "");
  if (value.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (value.length > 200) {
    return Response.json({ error: "Password is too long" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("customers")
    .update({ password_hash: hashPassword(value), login_attempts: 0, locked_until: null })
    .eq("id", session.id);

  if (error) return Response.json({ error: "Could not save the new password" }, { status: 500 });

  // The same sign-in, now with nothing owed.
  const store = await cookies();
  store.set(
    CUSTOMER_COOKIE,
    createCustomerToken({ id: session.id, phone: session.phone, name: session.name }),
    cookieOptions(CUSTOMER_MAX_AGE),
  );
  store.set(PASSWORD_HINT_COOKIE, "", { ...cookieOptions(0), httpOnly: false });
  return Response.json({ ok: true });
}
