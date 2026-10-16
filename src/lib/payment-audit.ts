import type { SupabaseClient } from "@supabase/supabase-js";
import { getAtomePayment } from "@/lib/atome";
import { getDokuPaymentStatus, isDokuStatusConfigured } from "@/lib/doku-status";
import { readAll } from "@/lib/paged";

/**
 * Checking the shop's word against the payment provider's.
 *
 * An order's status is written by a webhook, and a webhook can be missed. Two
 * ways that goes wrong, and they are not equally bad:
 *
 *   The shop says paid and the provider says it was not. That parcel gets
 *   packed and posted for nothing, and nobody notices until the month is
 *   reconciled. This is the one worth interrupting someone's day for.
 *
 *   The shop says unpaid and the provider took the money. The customer has
 *   paid and is waiting, which is a different kind of bad — and it is money
 *   already in the account, so it is found rather than lost.
 *
 * Read-only. Nothing here changes an order: a disagreement is reported for a
 * person to settle, because acting on a provider's answer automatically is how
 * a bad answer becomes a wrong shipment. Only DOKU's own checker marks orders
 * paid, and it does so on a far narrower rule than this.
 */

export type AuditVerdict =
  /** Website says paid; the provider does not agree. DO NOT SHIP. */
  | "ghost_paid"
  /** The provider took the money; the website never knew. */
  | "missed_payment"
  /** Both agree it is paid, for different amounts. */
  | "amount_mismatch"
  /** Both agree. */
  | "ok"
  /** The provider could not be asked, so nothing is claimed either way. */
  | "unknown";

export interface AuditRow {
  order_number: string;
  payment_method: string;
  website_status: string;
  provider_status: string | null;
  website_total: number;
  provider_amount: number | null;
  created_at: string;
  verdict: AuditVerdict;
  note?: string;
  customer?: string;
}

/** What the provider says, normalised to one shape across all three. */
interface ProviderAnswer {
  status: string | null;
  paid: boolean;
  amount: number | null;
  error?: string;
}

/**
 * Atome records a payment under the order number it was created with, so the
 * lookup works whether or not the webhook ever came back with a transaction
 * id — which is exactly the case this exists to catch.
 */
async function askAtome(orderNumber: string): Promise<ProviderAnswer> {
  try {
    const p = await getAtomePayment(orderNumber);
    return { status: p.status, paid: p.status === "PAID", amount: p.amount ?? null };
  } catch (err) {
    return { status: null, paid: false, amount: null, error: (err as Error).message };
  }
}

/**
 * A Stripe order holds a checkout session before payment and a payment intent
 * after it, so the reference's own prefix says which to ask about. Anything
 * else is left unknown rather than guessed at.
 */
async function askStripe(reference: string | null): Promise<ProviderAnswer> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: null, paid: false, amount: null, error: "Stripe is not configured" };
  const ref = String(reference || "").trim();
  if (!ref) return { status: null, paid: false, amount: null, error: "No Stripe reference stored" };

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);

    if (ref.startsWith("cs_")) {
      const s = await stripe.checkout.sessions.retrieve(ref);
      return {
        status: s.payment_status,
        paid: s.payment_status === "paid",
        // Stripe counts in sen; the shop counts in ringgit.
        amount: s.amount_total == null ? null : s.amount_total / 100,
      };
    }
    if (ref.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.retrieve(ref);
      return {
        status: pi.status,
        paid: pi.status === "succeeded",
        amount: pi.amount == null ? null : pi.amount / 100,
      };
    }
    // A subscription renewal is recorded against the invoice Stripe charged,
    // which is neither a session nor an intent. Without this every renewal
    // read as "could not check" — the orders most worth confirming, because
    // they are created by a webhook with no customer watching.
    if (ref.startsWith("in_")) {
      const invoice = await stripe.invoices.retrieve(ref);
      return {
        status: invoice.status ?? null,
        // amount_paid rather than status alone: a partially paid invoice is
        // not a paid order.
        paid: invoice.status === "paid" && (invoice.amount_paid ?? 0) > 0,
        amount: invoice.amount_paid == null ? null : invoice.amount_paid / 100,
      };
    }
    return { status: null, paid: false, amount: null, error: `Unrecognised reference "${ref.slice(0, 12)}…"` };
  } catch (err) {
    return { status: null, paid: false, amount: null, error: (err as Error).message };
  }
}

async function askDoku(orderNumber: string): Promise<ProviderAnswer> {
  if (!isDokuStatusConfigured()) {
    return { status: null, paid: false, amount: null, error: "DOKU is not configured" };
  }
  const r = await getDokuPaymentStatus(orderNumber);
  return { status: r.status, paid: r.paid, amount: r.amount, error: r.error };
}

function verdictFor(order: { payment_status: string; total: number }, answer: ProviderAnswer): {
  verdict: AuditVerdict;
  note?: string;
} {
  const websitePaid = order.payment_status === "paid";

  if (answer.error || answer.status == null) {
    return { verdict: "unknown", note: answer.error || "No answer from the provider" };
  }

  if (websitePaid && !answer.paid) {
    // DOKU is the exception the probe established: an FPX payment that timed
    // out reads as PENDING here even when the dashboard shows it failed, so a
    // PENDING cannot be read as proof the money never came.
    return {
      verdict: "ghost_paid",
      note: `Marked paid here, but the provider says "${answer.status}"`,
    };
  }

  if (!websitePaid && answer.paid) {
    return { verdict: "missed_payment", note: "The provider took this money and the website never recorded it" };
  }

  if (websitePaid && answer.paid && answer.amount != null) {
    const diff = Math.abs(Number(order.total) - answer.amount);
    // A cent of rounding is not a discrepancy.
    if (diff > 0.011) {
      return { verdict: "amount_mismatch", note: `Provider holds ${answer.amount.toFixed(2)}, order says ${Number(order.total).toFixed(2)}` };
    }
  }

  return { verdict: "ok" };
}

/**
 * Which gateway actually holds this payment.
 *
 * The order's payment_method says which was chosen, and until the resume route
 * was fixed it could be stale: an Atome order retried through the payment link
 * was charged at DOKU while still recording "atome". Asking Atome about it
 * returned the abandoned Atome attempt, CANCELLED, and a paid order was
 * reported as one to hold back from shipping.
 *
 * The reference settles it, because each gateway writes its own shape — DOKU a
 * UUID, Atome an MTX number, Stripe a cs_ or pi_ prefix. Where it says nothing
 * (an order that was never paid still carries its own number), the chosen
 * method stands.
 */
function providerHolding(order: { payment_method: string; payment_reference: string | null }): string {
  const ref = String(order.payment_reference || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return "doku";
  if (/^MTX\d+/.test(ref)) return "atome";
  if (ref.startsWith("cs_") || ref.startsWith("pi_") || ref.startsWith("in_")) return "stripe";
  return order.payment_method;
}

/** Asked a handful at a time: a provider will throttle a few hundred at once. */
async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  }
  return out;
}

export interface AuditOptions {
  methods?: string[];
  /** How far back to look. */
  days?: number;
  /** A ceiling, so one run cannot outlast the function's own time limit. */
  limit?: number;
}

export async function auditPayments(
  db: SupabaseClient,
  { methods = ["atome", "stripe"], days = 30, limit = 400 }: AuditOptions = {},
): Promise<{ rows: AuditRow[]; checked: number; summary: Record<AuditVerdict, number> }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const orders = await readAll<{
    order_number: string;
    payment_method: string;
    payment_status: string;
    payment_reference: string | null;
    total: number;
    created_at: string;
    shipping: { name?: string } | null;
  }>(
    (from, to) =>
      db
        .from("orders")
        .select("order_number, payment_method, payment_status, payment_reference, total, created_at, shipping")
        .in("payment_method", methods)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to),
    { what: "orders to audit" },
  );

  const subset = orders.slice(0, limit);

  const rows = await inBatches(subset, 5, async (order): Promise<AuditRow> => {
    const holder = providerHolding(order);
    const answer =
      holder === "atome"
        ? await askAtome(order.order_number)
        : holder === "stripe"
          ? await askStripe(order.payment_reference)
          : await askDoku(order.order_number);

    const { verdict, note } = verdictFor(order, answer);
    return {
      order_number: order.order_number,
      // What was asked, which is not always what was chosen.
      payment_method: holder,
      website_status: order.payment_status,
      provider_status: answer.status,
      website_total: Number(order.total) || 0,
      provider_amount: answer.amount,
      created_at: order.created_at,
      customer: order.shipping?.name,
      verdict,
      note,
    };
  });

  const summary = { ghost_paid: 0, missed_payment: 0, amount_mismatch: 0, ok: 0, unknown: 0 };
  for (const row of rows) summary[row.verdict]++;

  return { rows, checked: rows.length, summary };
}
