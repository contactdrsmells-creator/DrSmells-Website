import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, cookieOptions, createCustomerToken,
  normalisePhone, sessionsAreConfigured, supabaseAdmin,
} from "@/lib/customer-auth";

/** Wrong guesses allowed against one code before it is thrown away. */
const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  if (!sessionsAreConfigured()) {
    return Response.json({ error: "Accounts are not switched on yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const phone = normalisePhone(body.phone || "");
  const code = String(body.code || "").trim();
  if (!phone || !/^\d{4,8}$/.test(code)) {
    return Response.json({ error: "Enter the code from WhatsApp" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: otp } = await db
    .from("customer_otps")
    .select("id, code_hash, expires_at, attempts")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const wrong = () => Response.json({ error: "That code is not right or has expired" }, { status: 401 });

  if (!otp) return wrong();
  if (new Date(otp.expires_at) < new Date()) return wrong();
  if (Number(otp.attempts || 0) >= MAX_ATTEMPTS) return wrong();

  const given = Buffer.from(createHash("sha256").update(code).digest("hex"));
  const stored = Buffer.from(String(otp.code_hash || ""));
  const matches = given.length === stored.length && timingSafeEqual(given, stored);

  if (!matches) {
    await db.from("customer_otps")
      .update({ attempts: Number(otp.attempts || 0) + 1 }).eq("id", otp.id);
    return wrong();
  }

  // Spent the moment it works, so the same code cannot be used twice.
  await db.from("customer_otps")
    .update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

  const { data: customer } = await db
    .from("customers").select("id, phone, name").eq("phone", phone).maybeSingle();
  if (!customer) return wrong();

  // The number is now proven, which is what a password reset rests on and what
  // will later allow the account to claim the orders placed under it.
  await db.from("customers").update({
    whatsapp_verified_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
    login_attempts: 0,
    locked_until: null,
  }).eq("id", customer.id);

  const store = await cookies();
  store.set(CUSTOMER_COOKIE, createCustomerToken(customer), cookieOptions(CUSTOMER_MAX_AGE));
  return Response.json({ customer });
}
