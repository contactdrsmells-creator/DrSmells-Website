import { getCustomerSession, hashPassword, supabaseAdmin } from "@/lib/customer-auth";

/**
 * Setting a new password.
 *
 * Only the signed-in account may change its own, and signing in is the proof:
 * a customer who has forgotten their password gets here by the WhatsApp code,
 * which establishes the number is theirs. There is deliberately no reset link
 * by email — the account has no verified email to send one to.
 */
export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Please log in first" }, { status: 401 });

  const { password } = await request.json().catch(() => ({}));
  if (String(password || "").length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("customers")
    .update({ password_hash: hashPassword(String(password)), login_attempts: 0, locked_until: null })
    .eq("id", session.id);

  if (error) return Response.json({ error: "Could not save the new password" }, { status: 500 });
  return Response.json({ ok: true });
}
