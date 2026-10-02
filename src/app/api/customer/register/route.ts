import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, cookieOptions, createCustomerToken,
  hashPassword, normalisePhone, supabaseAdmin,
} from "@/lib/customer-auth";
import { getRules } from "@/lib/points";

/**
 * Opens an account against a mobile number.
 *
 * The number is not proved to belong to whoever is typing it — that waits for
 * WhatsApp codes — so an account starts with no claim over the orders already
 * placed under that number. It earns from what it buys from here on. Linking a
 * number's history is what the verification step will be for.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const phone = normalisePhone(body.phone || "");
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);

  if (!phone) return Response.json({ error: "Please enter a valid mobile number" }, { status: 400 });
  if (password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("customers").select("id").eq("phone", phone).maybeSingle();
  if (existing) {
    return Response.json({ error: "This number already has an account. Please log in." }, { status: 409 });
  }

  const { data: created, error } = await db
    .from("customers")
    .insert({ phone, name: name || null, password_hash: hashPassword(password) })
    .select("id, phone, name")
    .single();

  if (error || !created) {
    return Response.json({ error: "Could not create the account" }, { status: 500 });
  }

  const rules = await getRules(db);
  if (rules.enabled && rules.signup_bonus > 0) {
    await db.from("points_ledger").insert({
      customer_id: created.id,
      delta: rules.signup_bonus,
      reason: "signup",
    });
  }

  const store = await cookies();
  store.set(CUSTOMER_COOKIE, createCustomerToken(created), cookieOptions(CUSTOMER_MAX_AGE));
  return Response.json({ customer: created, bonus: rules.enabled ? rules.signup_bonus : 0 });
}
