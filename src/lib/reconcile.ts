import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/paged";
import { checkPostcode } from "@/lib/postcode";

/**
 * Checking the shop's two databases against each other.
 *
 * Every website order is written twice — once here and once in the CRM — and
 * the copies had drifted without anything saying so. A package re-pointed from
 * 配套 A to 配套 B carried RM167 against a RM145 sale and put five sets into
 * every report that were never sold. Thirteen Singapore orders reached the CRM
 * labelled Malaysia, so an export read them as domestic. Four orders were
 * filed under a gateway that never took the money.
 *
 * All of it was found by comparing the two by hand, which is not a thing
 * anyone does twice. None of it needed a payment provider: the shop already
 * holds both halves of the answer, which is what makes this cheap enough to
 * run every morning.
 *
 * Read-only, and silent when the two agree.
 */

export interface Finding {
  kind: string;
  order: string;
  detail: string;
  /** Ringgit at stake, where the disagreement is about money. */
  amount?: number;
}

interface CrmOrder {
  order_id: string;
  channel: string;
  status: string;
  product: string | null;
  quantity: number | null;
  amount: number | null;
  subtotal: number | null;
  shipping_fee: number | null;
  discount: number | null;
  state: string | null;
  country: string | null;
  order_items: string | null;
}

interface WebOrder {
  order_number: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  items: { product_name?: string; variation?: string; quantity?: number }[] | null;
  shipping: { state?: string; country?: string; postcode?: string } | null;
  subtotal: number | null;
  shipping_cost: number | null;
  discount: number | null;
  points_discount: number | null;
  total: number | null;
  created_at: string;
}

/** The package tags a line names, which is what a mis-pointed order changes. */
function packageTags(text: string): string {
  const found = String(text || "").match(/配套\s*[A-D]|PWP/g) || [];
  return [...new Set(found.map((t) => t.replace(/\s+/g, "")))].sort().join("+");
}

/** Which gateway a reference actually belongs to, whatever the order claims. */
function gatewayOf(reference: string | null): string | null {
  const ref = String(reference || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return "doku";
  if (/^MTX\d+/.test(ref)) return "atome";
  if (ref.startsWith("cs_") || ref.startsWith("pi_") || ref.startsWith("in_")) return "stripe";
  return null;
}

async function crmFeed(days: number): Promise<CrmOrder[] | null> {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return null;

  const endpoint = url.replace(/\/[^/]*$/, "/reconcile-feed");
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
      body: JSON.stringify({ days }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.error("[Reconcile] CRM refused the feed:", res.status);
      return null;
    }
    return (await res.json())?.orders || [];
  } catch (err) {
    console.error("[Reconcile] CRM unreachable:", (err as Error).message);
    return null;
  }
}

export async function reconcile(
  db: SupabaseClient,
  days = 7,
): Promise<{ findings: Finding[]; checked: number; crmReachable: boolean }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const web = await readAll<WebOrder>(
    (from, to) =>
      db
        .from("orders")
        .select(
          "order_number, payment_status, payment_method, payment_reference, items, shipping, subtotal, shipping_cost, discount, points_discount, total, created_at",
        )
        .gte("created_at", since)
        .range(from, to),
    { what: "orders to reconcile" },
  );

  const crm = await crmFeed(days);
  const byId = new Map((crm || []).map((o) => [o.order_id, o]));
  const findings: Finding[] = [];

  for (const o of web) {
    // Only orders that were paid, because only those will be shipped. An
    // abandoned cart with a mistyped postcode is not a problem anybody needs
    // woken up about, and on a test run four of the five things found were
    // exactly that — the noise that teaches a reader to skip the message.
    if (o.payment_status !== "paid") continue;

    // An address that cannot belong to the country it was filed under. Caught
    // at checkout now, but an order edited later can still drift.
    const postcode = checkPostcode(o.shipping?.postcode, o.shipping?.country);
    if (!postcode.ok) {
      findings.push({
        kind: "Address does not match its country",
        order: o.order_number,
        detail: `${o.shipping?.postcode} filed under ${o.shipping?.country}`,
      });
    }

    // A Singapore address filed as Malaysia ships on the wrong service and is
    // quoted the wrong postage.
    const state = String(o.shipping?.state || "");
    const country = String(o.shipping?.country || "");
    if (/singapore/i.test(state) && !/singapore/i.test(country)) {
      findings.push({
        kind: "Singapore order labelled otherwise",
        order: o.order_number,
        detail: `state "${state}" but country "${country}"`,
      });
    }

    // The gateway the reference belongs to, against the one recorded. An order
    // resumed through the payment link changes hands and used to keep the old
    // label, which then misreported which gateway earned the money.
    const holder = gatewayOf(o.payment_reference);
    if (holder && o.payment_method && holder !== o.payment_method) {
      findings.push({
        kind: "Filed under the wrong gateway",
        order: o.order_number,
        detail: `recorded as ${o.payment_method}, reference belongs to ${holder}`,
        amount: Number(o.total) || 0,
      });
    }

    // A paid order the CRM never received is one nobody will pack. Only looked
    // for where the CRM answered, and never for the newest few minutes, which
    // a sync may legitimately still be working through.
    const crmOrder = byId.get(o.order_number);
    const ageMinutes = (Date.now() - new Date(o.created_at).getTime()) / 60_000;
    if (crm && !crmOrder && ageMinutes > 30) {
      findings.push({
        kind: "Paid order missing from the CRM",
        order: o.order_number,
        detail: "paid here, never reached the CRM — nobody will pack it",
        amount: Number(o.total) || 0,
      });
      continue;
    }
    if (!crmOrder) continue;

    // What each side says is in the box. The tags rather than the whole string,
    // because the two systems write the product's name differently by design.
    const webTags = packageTags((o.items || []).map((i) => i.variation || "").join(" "));
    const crmTags = packageTags(`${crmOrder.product || ""} ${crmOrder.order_items || ""}`);
    if (webTags && crmTags && webTags !== crmTags) {
      findings.push({
        kind: "Different package in each system",
        order: o.order_number,
        detail: `website says ${webTags}, CRM says ${crmTags}`,
        amount: Math.abs((Number(crmOrder.amount) || 0) - (Number(o.total) || 0)),
      });
    }

    // What each side says was collected.
    const webTotal = Number(o.total) || 0;
    const crmTotal = Number(crmOrder.amount) || 0;
    if (Math.abs(webTotal - crmTotal) > 0.011) {
      findings.push({
        kind: "Different total in each system",
        order: o.order_number,
        detail: `website RM${webTotal.toFixed(2)}, CRM RM${crmTotal.toFixed(2)}`,
        amount: Math.abs(webTotal - crmTotal),
      });
    }

    // And whether the CRM's own breakdown adds up, which is what an export
    // shows and what gets reconciled against a courier bill.
    if (crmOrder.subtotal != null) {
      const parts =
        (Number(crmOrder.subtotal) || 0) +
        (Number(crmOrder.shipping_fee) || 0) -
        (Number(crmOrder.discount) || 0);
      if (Math.abs(parts - crmTotal) > 0.011) {
        findings.push({
          kind: "CRM breakdown does not add up",
          order: o.order_number,
          detail: `items + shipping - discount = RM${parts.toFixed(2)}, but total says RM${crmTotal.toFixed(2)}`,
          amount: Math.abs(parts - crmTotal),
        });
      }
    }
  }

  return { findings, checked: web.length, crmReachable: crm !== null };
}
