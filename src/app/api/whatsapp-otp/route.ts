import { randomInt } from "crypto";
import { requirePermission } from "@/lib/admin-auth";
import { getSupabase, normalisePhone } from "@/lib/whatsapp-automation";
import { OTP_SETTINGS_KEY, loadOtpWebhook, sendCodeViaWebhook } from "@/lib/otp-webhook";

/**
 * Admin: the Chatshero workflow that sends WhatsApp login codes.
 *
 * GET  — the webhook URL, and whether a secret is saved (never the secret).
 * PUT  — { webhook_url, secret } ; an empty or masked secret keeps the saved one.
 * POST — { phone } sends a test code to that number.
 */

const MASK = "••••••••";

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;
  const c = await loadOtpWebhook();
  return Response.json({ webhook_url: c.webhook_url, secret: c.secret ? MASK : "", secret_set: !!c.secret });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const url = String(body.webhook_url || "").trim();
  if (url && (!url.startsWith("https://") || url.length > 500)) {
    return Response.json({ error: "Webhook URL must start with https://" }, { status: 400 });
  }

  const existing = await loadOtpWebhook();
  const typed = String(body.secret || "").trim();
  const secret = !typed || typed === MASK ? existing.secret : typed;
  if (secret && !/^[\x21-\x7e]{8,200}$/.test(secret)) {
    return Response.json({ error: "The secret must be 8–200 characters with no spaces" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("site_settings")
    .upsert({ key: OTP_SETTINGS_KEY, value: { webhook_url: url, secret } }, { onConflict: "key" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { phone } = await request.json().catch(() => ({ phone: "" }));
  const to = normalisePhone(phone);
  if (!to) return Response.json({ error: "Enter a valid mobile number" }, { status: 400 });

  const c = await loadOtpWebhook();
  if (!c.webhook_url || !c.secret) {
    return Response.json({ error: "Save the webhook URL and secret first" }, { status: 400 });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const r = await sendCodeViaWebhook(c, to, code, 10, true);
  return Response.json({ ok: r.ok, sent_to: to, code, status: r.status, response: r.body });
}
