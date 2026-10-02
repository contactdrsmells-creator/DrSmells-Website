import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, cookieOptions, createCustomerToken,
  normalisePhone, supabaseAdmin, verifyPassword,
} from "@/lib/customer-auth";

/** How many wrong passwords before the account rests, and for how long. */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
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

  if (customer.locked_until && new Date(customer.locked_until) > new Date()) {
    return Response.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  if (!verifyPassword(password, customer.password_hash)) {
    const attempts = Number(customer.login_attempts || 0) + 1;
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
