import { createClient } from "@supabase/supabase-js";

/**
 * Strive Flowbuilder integration for automated WhatsApp follow-ups.
 *
 * Strive expects a form-encoded POST with a `strive-flowbuilder-key` header.
 * `phone` is required; every other field becomes a variable available inside the
 * Strive flow, which is where the actual message wording lives.
 */

export interface WhatsAppAutomationConfig {
  enabled: boolean;
  webhook_url: string;
  flowbuilder_key: string;
  /** Order status that qualifies for a reminder. */
  trigger_status: string;
  /** Wait this long after the order is created before messaging. */
  delay_hours: number;
  /**
   * When the automation was switched on. Only orders created after this are
   * ever eligible, so enabling it never chases the existing backlog.
   */
  activated_at: string | null;
  /** POST field name Strive expects for the recipient number. */
  phone_field: string;
}

export const DEFAULT_AUTOMATION: WhatsAppAutomationConfig = {
  enabled: false,
  webhook_url: "https://api.strive.asia/custom/strive/flowbuilder/webhook.php",
  flowbuilder_key: "",
  trigger_status: "pending",
  delay_hours: 3,
  activated_at: null,
  phone_field: "phone",
};

/**
 * A customer who paid this recently is not chased about a leftover unpaid
 * order — duplicates are usually failed retries of the purchase they completed.
 */
export const RECENT_PAYMENT_WINDOW_HOURS = 24;

export const SETTINGS_KEY = "whatsapp_automation";

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function loadAutomationConfig(): Promise<WhatsAppAutomationConfig> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .single();

  return { ...DEFAULT_AUTOMATION, ...(data?.value || {}) };
}

/**
 * WhatsApp needs an international number. Customers type local formats
 * ("0109776875", "+60 10-977 6875"), so normalise to 60XXXXXXXXX.
 * Returns null when there aren't enough digits to be a real number.
 */
export function normalisePhone(raw: string | undefined | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let normalised = digits;
  if (normalised.startsWith("60")) {
    // already international
  } else if (normalised.startsWith("0")) {
    normalised = "60" + normalised.slice(1);
  } else {
    normalised = "60" + normalised;
  }

  // Malaysian mobiles are 60 + 9 or 10 digits.
  if (normalised.length < 11 || normalised.length > 13) return null;

  // Reject placeholders like 0000000000 / 1111111111 that real orders do
  // contain — they normalise to a valid-looking length but aren't numbers.
  const subscriber = normalised.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return null;

  return normalised;
}

export interface StriveSendResult {
  ok: boolean;
  status: number;
  body: string;
}

/** POSTs one payload to Strive Flowbuilder. Never throws. */
export async function sendToStrive(
  config: WhatsAppAutomationConfig,
  fields: Record<string, string>,
): Promise<StriveSendResult> {
  try {
    const res = await fetch(config.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "strive-flowbuilder-key": config.flowbuilder_key,
      },
      body: new URLSearchParams(fields).toString(),
    });

    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}
