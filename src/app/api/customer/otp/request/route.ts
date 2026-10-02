import { createHash, randomInt, timingSafeEqual } from "crypto";
import { normalisePhone, sessionsAreConfigured, supabaseAdmin } from "@/lib/customer-auth";
import { sendLoginCode, whatsappConfigured } from "@/lib/whatsapp";

/** A code lives ten minutes, and a number may ask for three in an hour. */
const CODE_MINUTES = 10;
const MAX_PER_HOUR = 3;

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export { timingSafeEqual };

export async function POST(request: Request) {
  if (!sessionsAreConfigured()) {
    return Response.json({ error: "Accounts are not switched on yet." }, { status: 503 });
  }
  if (!whatsappConfigured()) {
    console.error("[OTP] WhatsApp is not configured on this project");
    return Response.json(
      { error: "WhatsApp codes are not set up yet. Please contact us." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const phone = normalisePhone(body.phone || "");
  if (!phone) return Response.json({ error: "Please enter a valid mobile number" }, { status: 400 });

  const db = supabaseAdmin();

  // Answered the same way whether or not the number has an account: telling
  // them apart would let anyone test which numbers are customers.
  const sent = Response.json({
    ok: true,
    message: "If that number has an account, a code is on its way on WhatsApp.",
  });

  const { data: customer } = await db
    .from("customers").select("id").eq("phone", phone).maybeSingle();
  if (!customer) return sent;

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("customer_otps")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", hourAgo);
  if ((count || 0) >= MAX_PER_HOUR) {
    return Response.json(
      { error: "Too many codes requested. Please try again later." },
      { status: 429 },
    );
  }

  // Six digits, from the system's own randomness rather than Math.random,
  // which is predictable enough to guess a code from earlier ones.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  // Any code still outstanding for this number is spent, so an older message
  // cannot be used once a newer one has been asked for.
  await db
    .from("customer_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("phone", phone)
    .is("consumed_at", null);

  const { error } = await db.from("customer_otps").insert({
    phone,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    console.error("[OTP] Could not store the code:", error.message);
    return Response.json({ error: "Could not send a code. Please try again." }, { status: 500 });
  }

  const outcome = await sendLoginCode(phone, code);
  if (!outcome.ok) {
    return Response.json(
      { error: "Could not send the code on WhatsApp. Please contact us." },
      { status: 502 },
    );
  }
  return sent;
}
