import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, cookieOptions, createCustomerToken,
  normalisePhone, sessionsAreConfigured, supabaseAdmin, verifyPassword,
} from "@/lib/customer-auth";

/** How many wrong passwords before the account rests, and for how long. */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!sessionsAreConfigured()) {
    console.error("[Customer] CUSTOMER_SESSION_SECRET is not set — refusing to log in");
    return Response.json(
      { error: "Accounts are not switched on yet. Please contact us." },
      { status: 503 },
    );
  }

  const phone = normalisePhone(body.phone || "");
  const password = String(body.password || "");
  if (!phone || !password) {
    return Response.json({ error: "Enter your mobile number and password" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select("id, phone, name, password_hash, login_attempts, locked_until")
    .eq("phone", phone)
    .maybeSingle();

  // The same answer whether the number is unknown or the password is wrong:
  // telling them apart would let anyone test which numbers hold an account.
  const wrong = () =>
    Response.json({ error: "Mobile number or password is incorrect" }, { status: 401 });

  if (!customer || !customer.password_hash) return wrong();

  const lockedUntil = customer.locked_until ? new Date(customer.locked_until) : null;

  if (lockedUntil && lockedUntil > new Date()) {
    // Say how long. "A few minutes" leaves someone refreshing every thirty
    // seconds, and the person who most needs this message is the one who has
    // just been given a new password and believes it does not work.
    const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
    return Response.json(
      { error: `Too many wrong attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429 },
    );
  }

  if (!verifyPassword(password, customer.password_hash)) {
    /**
     * A served lockout clears the count.
     *
     * It did not, so login_attempts stayed at 5 for good once an account had
     * been locked — and the next single typo, days or weeks later, put it
     * straight back to 5 and locked it for another quarter of an hour. One
     * customer sat at five attempts for nineteen days that way.
     *
     * Someone who has waited out the lock has done what was asked of them and
     * gets the full five tries again. Typing a ten-character temporary
     * password on a phone takes more than one go.
     */
    const served = lockedUntil !== null;
    const attempts = (served ? 0 : Number(customer.login_attempts || 0)) + 1;
    await db.from("customers").update({
      login_attempts: attempts,
      locked_until: attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null,
    }).eq("id", customer.id);
    return wrong();
  }

  await db.from("customers").update({
    login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString(),
  }).eq("id", customer.id);

  const session = { id: customer.id, phone: customer.phone, name: customer.name };
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, createCustomerToken(session), cookieOptions(CUSTOMER_MAX_AGE));
  return Response.json({ customer: session });
}
