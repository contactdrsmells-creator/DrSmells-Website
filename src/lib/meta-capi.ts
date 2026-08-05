import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Meta Conversions API — reports a sale to Meta from the server.
 *
 * The browser pixel alone could only report a purchase while the customer was
 * still sitting on the confirmation page, and only if payment confirmed within
 * a twenty second poll. Most Malaysian FPX payments do not work that way: the
 * customer pays in a banking app, a DOKU notification arrives late or never,
 * and orders rescued by the status-check cron are marked paid hours later with
 * no browser present at all. Those sales never reached Meta, so Ads Manager
 * reported zero against campaigns that had in fact produced revenue.
 *
 * This fires from the server instead, on every path that marks an order paid.
 *
 * Two details make it work rather than merely fire:
 *
 *   - The click identifiers (_fbc / _fbp), the customer's IP and their user
 *     agent are captured at CHECKOUT and stored on the order. At webhook time
 *     the request belongs to DOKU, so reading them there would attribute the
 *     sale to a payment gateway in Jakarta. Storing them also means a customer
 *     who pays days later through a WhatsApp reminder link still carries the
 *     click id of the ad that originally brought them.
 *
 *   - The order number is sent as event_id, matching the eventID the browser
 *     pixel uses. Meta discards the duplicate when both arrive, so orders that
 *     did report from the browser are not counted twice.
 *
 * Never throws. A reporting failure must not fail a payment webhook.
 */

const GRAPH_VERSION = "v21.0";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "974864253889078";

/** Meta requires every identifier hashed with SHA-256, except the click ids. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashed(value: unknown): string | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Digits only, country code included, no leading plus — Meta's phone rule. */
function hashedPhone(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? sha256(digits) : undefined;
}

/** Names and cities drop punctuation and whitespace before hashing. */
function hashedName(value: unknown): string | undefined {
  const v = String(value ?? "").trim().toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  return v ? sha256(v) : undefined;
}

function hashedPostcode(value: unknown): string | undefined {
  const v = String(value ?? "").replace(/\s/g, "").toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Two-letter ISO, lowercased. Orders store full names like "Malaysia". */
function hashedCountry(value: unknown): string | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return sha256("my");
  if (v.length === 2) return sha256(v);
  const known: Record<string, string> = {
    malaysia: "my",
    singapore: "sg",
    brunei: "bn",
    indonesia: "id",
    thailand: "th",
  };
  return sha256(known[v] || v.slice(0, 2));
}

interface MetaAttribution {
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
  event_source_url?: string;
}

interface OrderShipping {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface OrderItem {
  product_id?: string;
  quantity?: number;
  unit_price?: number;
}

interface OrderRow {
  order_number: string;
  total: number | string;
  items?: OrderItem[] | null;
  shipping?: OrderShipping | null;
  payment_status?: string | null;
  meta_attribution?: MetaAttribution | null;
  updated_at?: string | null;
}

/** Meta rejects an event_time older than seven days. */
function eventTimeFor(order: OrderRow): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const paidAt = order.updated_at ? Math.floor(new Date(order.updated_at).getTime() / 1000) : nowSeconds;
  if (!Number.isFinite(paidAt)) return nowSeconds;
  const sevenDaysAgo = nowSeconds - 7 * 24 * 60 * 60;
  return Math.min(nowSeconds, Math.max(paidAt, sevenDaysAgo + 60));
}

function buildPayload(order: OrderRow, testEventCode?: string) {
  const shipping = order.shipping || {};
  const attribution = order.meta_attribution || {};
  const items = Array.isArray(order.items) ? order.items : [];

  // Meta matches on first and last name only. Malaysian names often run to
  // three or more parts, so the last one is the surname — folding the middle
  // parts into it would hash to something Meta can never match.
  const nameParts = String(shipping.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

  // Hashed identifiers are how Meta matches a purchase to a person when the
  // click cookies are missing — which is exactly the WhatsApp reminder case,
  // where payment completes in an in-app browser that never saw the ad.
  const userData: Record<string, unknown> = {
    em: hashed(shipping.email),
    ph: hashedPhone(shipping.phone),
    fn: hashedName(firstName),
    ln: hashedName(lastName),
    ct: hashedName(shipping.city),
    st: hashedName(shipping.state),
    zp: hashedPostcode(shipping.postcode),
    country: hashedCountry(shipping.country),
    // A stable per-customer id improves matching across repeat orders.
    external_id: hashedPhone(shipping.phone) || hashed(shipping.email),
    // Click identifiers are sent raw — hashing them would break the match.
    fbc: attribution.fbc || undefined,
    fbp: attribution.fbp || undefined,
    client_ip_address: attribution.client_ip_address || undefined,
    client_user_agent: attribution.client_user_agent || undefined,
  };

  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  const contents = items
    .filter((i) => i?.product_id)
    .map((i) => ({
      id: String(i.product_id),
      quantity: Number(i.quantity) || 1,
      item_price: Number(i.unit_price) || 0,
    }));

  const customData: Record<string, unknown> = {
    currency: "MYR",
    value: Number(order.total) || 0,
    order_id: order.order_number,
  };

  if (contents.length) {
    customData.content_type = "product";
    customData.content_ids = contents.map((c) => c.id);
    customData.contents = contents;
    customData.num_items = contents.reduce((sum, c) => sum + c.quantity, 0);
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTimeFor(order),
        // Matches the browser pixel's eventID, so a sale reported by both is
        // counted once.
        event_id: order.order_number,
        event_source_url: attribution.event_source_url || "https://drsmells.com.my/checkout",
        action_source: "website",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  if (testEventCode) payload.test_event_code = testEventCode;

  return payload;
}

export interface CapiResult {
  ok: boolean;
  skipped?: string;
  error?: string;
  eventsReceived?: number;
}

/** Posts one Purchase event. Exposed separately so the admin check can reuse it. */
export async function postPurchase(order: OrderRow, testEventCode?: string): Promise<CapiResult> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) return { ok: false, skipped: "META_CAPI_ACCESS_TOKEN not set" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(order, testEventCode)),
      },
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Meta nests the useful part; the top-level message is usually generic.
      const detail = body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: detail };
    }

    return { ok: true, eventsReceived: body?.events_received };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reports an order to Meta exactly once.
 *
 * The send is claimed with a conditional UPDATE rather than a read-then-write:
 * a late DOKU notification can race the status-check cron for the same order,
 * and checking a flag before setting it would let both through.
 */
export async function reportPurchaseToMeta(
  supabase: SupabaseClient,
  orderNumber: string,
): Promise<CapiResult> {
  if (!process.env.META_CAPI_ACCESS_TOKEN) {
    return { ok: false, skipped: "META_CAPI_ACCESS_TOKEN not set" };
  }

  let order: OrderRow | null = null;

  const { data: claimed, error: claimError } = await supabase
    .from("orders")
    .update({ meta_capi_sent_at: new Date().toISOString() })
    .eq("order_number", orderNumber)
    .is("meta_capi_sent_at", null)
    .select("order_number, total, items, shipping, payment_status, meta_attribution, updated_at")
    .maybeSingle();

  if (claimError) {
    // Almost always the migration not having been run yet. Report anyway and
    // let Meta's event_id de-duplication stand in for the claim, rather than
    // dropping the sale entirely.
    console.warn(`[MetaCAPI] Could not claim ${orderNumber} (${claimError.message}); sending unclaimed`);
    const { data } = await supabase
      .from("orders")
      .select("order_number, total, items, shipping, payment_status, updated_at")
      .eq("order_number", orderNumber)
      .maybeSingle();
    order = data as OrderRow | null;
  } else if (!claimed) {
    return { ok: true, skipped: "already reported" };
  } else {
    order = claimed as OrderRow;
  }

  if (!order) return { ok: false, error: "order not found" };

  if (order.payment_status !== "paid") {
    return { ok: false, skipped: `payment_status is ${order.payment_status}` };
  }

  const result = await postPurchase(order);

  if (!result.ok && !result.skipped && !claimError) {
    // Release the claim so the sale can still be reported later rather than
    // being permanently marked as sent by a failed attempt.
    await supabase
      .from("orders")
      .update({ meta_capi_sent_at: null })
      .eq("order_number", orderNumber);
  }

  if (result.ok) {
    console.log(`[MetaCAPI] Reported ${orderNumber} to Meta`);
  } else if (!result.skipped) {
    console.error(`[MetaCAPI] Failed to report ${orderNumber}: ${result.error}`);
  }

  return result;
}
