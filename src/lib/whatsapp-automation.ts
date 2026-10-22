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
  /**
   * Wait this long after the order is created before messaging.
   *
   * Minutes, because the useful waits are short: a customer who stalls at the
   * payment page is still at their phone for the next few minutes and gone by
   * the afternoon. delay_hours is what this used to be and is still read from
   * saved settings, so an existing shop keeps its wait until someone changes
   * it.
   */
  delay_minutes: number;
  /** @deprecated Superseded by delay_minutes. Read for settings saved before. */
  delay_hours?: number;
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
  delay_minutes: 15,
  activated_at: null,
  phone_field: "phone",
};

/**
 * Grace period applied when deciding whether a payment "belongs to" an unpaid
 * order. A customer who pays slightly before starting the abandoned order (for
 * example finishing one checkout then opening another) still counts as having
 * bought, so a small window back from the unpaid order is treated as paid.
 */
/**
 * How long to wait, whichever way it was saved.
 *
 * Settings written before this was measured in minutes hold delay_hours, and
 * must keep meaning the same wait rather than suddenly becoming three minutes.
 */
export function delayMinutes(config: WhatsAppAutomationConfig): number {
  if (Number.isFinite(config.delay_minutes) && config.delay_minutes > 0) {
    return config.delay_minutes;
  }
  const hours = Number(config.delay_hours);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 : DEFAULT_AUTOMATION.delay_minutes;
}

export const PAYMENT_GRACE_MINUTES = 30;

/**
 * One reminder per customer within this window, however many unpaid orders
 * they have.
 *
 * Grouping by phone only covers orders that come due in the same run. Someone
 * who retries checkout an hour later, or whose earlier order becomes eligible
 * afterwards, would otherwise be messaged again — which is what happened to a
 * customer with two failed attempts: two identical messages, hours apart.
 */
export const CUSTOMER_COOLDOWN_HOURS = 24;

/**
 * Messages only go out between these hours, Malaysia time. A checkout at 9pm
 * would otherwise reach the customer at midnight.
 *
 * Anything that falls due overnight is held rather than dropped: the job simply
 * doesn't send during quiet hours, leaving those orders unclaimed so the 8am
 * run picks them up.
 */
export const QUIET_HOURS_START = 0; // 00:00 — no sending from here...
export const QUIET_HOURS_END = 6; // ...until 06:00
export const BUSINESS_TIMEZONE = "Asia/Kuala_Lumpur";

/** Current hour (0–23) in the business's timezone, independent of server time. */
export function currentHourInBusinessTimezone(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return parseInt(formatted, 10);
}

/** True when messages should be held until the morning. */
export function isQuietHours(now: Date = new Date()): boolean {
  const hour = currentHourInBusinessTimezone(now);
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

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
 * WhatsApp needs an international number.
 *
 * Customers type local formats — "0109776875", "+60 10-977 6875" — so a
 * Malaysian number is completed to 60XXXXXXXXX. Most are, which is why this
 * once assumed all of them were.
 *
 * It isn't true. A Singapore customer typing "8818 6727" was turned into
 * 6088186727, and one typing "65 8818 6727" into 606588186727 — numbers that
 * do not exist. Six unpaid Singapore orders were "reminded" into the void,
 * and nobody could tell, because sending to a wrong number looks exactly like
 * sending to a right one.
 *
 * The order knows which country it ships to, so that decides the code rather
 * than the digits alone. Where the country is not given, Malaysia is still
 * assumed — that is what it almost always is.
 *
 * Except that the country is about the parcel and the number is about the
 * person, and the two part company constantly in Johor: a Singaporean living
 * across the causeway ships to Johor Jaya and gives their Singapore mobile.
 * Fourteen such orders were reminded at "606596482117" and the like, numbers
 * that exist nowhere, and WhatsApp answered "Message Undeliverable" — RM3,696
 * of carts messaged into the void.
 *
 * So a number carrying its own country code is believed over the parcel's
 * destination. "65" followed by eight digits beginning 8 or 9 is a Singapore
 * mobile whatever the shipping address says, and no Malaysian number can look
 * like that: Malaysian mobiles begin 01, and nothing there begins 65.
 */

/** Dialling code and local length for the countries the shop sells to. */
const DIALLING = {
  malaysia: { code: "60", min: 9, max: 10 },
  singapore: { code: "65", min: 8, max: 8 },
} as const;

export function normalisePhone(
  raw: string | undefined | null,
  country?: string | null,
): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // A number that names its own country wins over the parcel's destination.
  // Checked before anything else, because the Malaysian branch below would
  // otherwise read the 65 as part of a local number and prefix 60 to it.
  if (/^65[89]\d{7}$/.test(digits)) return digits;

  const where = /singapore|^sg$/i.test(String(country ?? "").trim())
    ? DIALLING.singapore
    : DIALLING.malaysia;

  let local = digits;
  // Already carries its own country code.
  if (local.startsWith(where.code)) local = local.slice(where.code.length);
  // A leading zero is the local trunk prefix, not part of the number.
  else if (local.startsWith("0")) local = local.slice(1);
  // A Malaysian-looking number on an order shipping elsewhere, or the reverse:
  // trust the digits, since somebody typed a full international number.
  else if (local.startsWith("60") && where.code !== "60" && local.length >= 11) {
    return normalisePhone(digits, "Malaysia");
  }

  if (local.length < where.min || local.length > where.max) return null;

  // Reject placeholders like 0000000000 / 1111111111 that real orders do
  // contain — they are a valid length but are not numbers.
  if (/^(\d)\1+$/.test(local)) return null;

  return where.code + local;
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
