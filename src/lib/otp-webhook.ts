import { getSupabase } from "@/lib/whatsapp-automation";

/**
 * Login codes sent through a Chatshero workflow.
 *
 * The shop's WhatsApp number lives in Chatshero, so the code goes there: a
 * Webhook Trigger receives { phone, code, minutes } and the workflow sends the
 * approved Authentication template. Set up under Admin → WhatsApp Automation.
 *
 * The secret is stored server-side only and never served to a browser.
 */

export const OTP_SETTINGS_KEY = "whatsapp_otp";

export interface OtpWebhookConfig {
  webhook_url: string;
  secret: string;
}

export async function loadOtpWebhook(): Promise<OtpWebhookConfig> {
  const { data } = await getSupabase()
    .from("site_settings")
    .select("value")
    .eq("key", OTP_SETTINGS_KEY)
    .maybeSingle();
  const v = (data?.value || {}) as Partial<OtpWebhookConfig>;
  return { webhook_url: String(v.webhook_url || ""), secret: String(v.secret || "") };
}

export function otpWebhookReady(c: OtpWebhookConfig): boolean {
  return c.webhook_url.startsWith("https://") && c.secret.length > 0;
}

/** Posts one code to the workflow. Never throws. */
export async function sendCodeViaWebhook(
  c: OtpWebhookConfig,
  phone: string,
  code: string,
  minutes: number,
  test = false,
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(c.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": c.secret },
      body: JSON.stringify({ phone, code, minutes: String(minutes), test }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}
