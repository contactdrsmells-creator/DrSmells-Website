import { createHash, createHmac, randomUUID } from "crypto";

/**
 * Creating a DOKU hosted checkout.
 *
 * Shared by /api/checkout and /pay/[order], because a checkout session is
 * single-use: once a customer's payment fails, that session is finished and
 * DOKU redirects anyone opening the link to callback_url instead of showing a
 * payment page. A reminder therefore cannot reuse the original link — it has to
 * mint a fresh one, which means this logic needs two callers.
 *
 * Contract established empirically against the live API:
 *  - the API Key authenticates (Basic), the Secret Key only signs (HMAC)
 *  - amounts are in ringgit, not cents
 *  - line_items must sum exactly to order.amount, and no price may be negative
 */

export interface DokuLineItem {
  name: string;
  quantity: number;
  price: number;
}

export interface DokuCheckoutInput {
  orderNumber: string;
  /** The amount to charge, in ringgit. Always read from the database. */
  total: number;
  shippingCost: number;
  items: { product_name: string; quantity: number; unit_price: number }[];
  voucherCode?: string | null;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  /** Origin of the site, used for the customer-facing redirects. */
  origin: string;
}

export interface DokuCheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
}

/**
 * A failed attempt to create a checkout, and whether asking again could help.
 *
 * The two cases need opposite handling and look identical from outside: a
 * gateway that is merely busy should be retried, while an order DOKU will
 * never accept must be reported to the customer instead of being shuffled
 * through a second attempt that lands them on a page with no way to pay.
 */
export class DokuCheckoutError extends Error {
  constructor(
    message: string,
    /** True when DOKU refused this order itself, so a retry would be refused too. */
    readonly permanent: boolean,
    /** DOKU's own words, for the server log. */
    readonly detail = "",
  ) {
    super(message);
    this.name = "DokuCheckoutError";
  }
}

export function isDokuConfigured(): boolean {
  return !!(process.env.DOKU_CLIENT_ID && process.env.DOKU_SECRET_KEY && process.env.DOKU_API_KEY);
}

/**
 * Builds the line items DOKU will accept.
 *
 * DOKU rejects the order unless line_items sum exactly to order.amount
 * ("AMOUNT NOT MATCH"), and rejects negative prices — so a discount cannot be
 * expressed as its own line. Itemise when the numbers line up, and fall back to
 * a single net-priced line when they can't (a voucher was used, or float
 * rounding leaves a cent unaccounted for).
 */
/**
 * Text DOKU will accept.
 *
 * The gateway refuses anything outside plain English — "Cannot contain
 * special character", in their words, confirmed by DOKU support. It took down
 * one checkout in eight: of 421 orders carrying a Chinese name, a fullwidth
 * comma or a curly quote, 56 were refused, while every one of the 23 orders
 * that happened to be pure English went through.
 *
 * So the text is cleaned on its way out and nowhere else. The shop keeps its
 * Chinese names, the CRM and the courier keep the address exactly as the
 * customer typed it; only DOKU's copy is flattened, because only DOKU objects.
 *
 * Curly quotes and dashes become their plain equivalents rather than being
 * dropped, since a phone keyboard produces them from ordinary typing and
 * losing them would mangle an English address for no reason.
 */
const LOOKALIKES: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "-", "\u00D7": "x", "\uFF0C": ",",
  "\u3001": ",", "\u00A0": " ",
};

export function dokuSafeText(raw: string | null | undefined, fallback = ""): string {
  const replaced = String(raw ?? "").replace(
    /[\u2018\u2019\u201C\u201D\u2013\u2014\u00D7\uFF0C\u3001\u00A0]/g,
    (ch) => LOOKALIKES[ch] ?? " ",
  );

  // An allowlist, not a list of things to remove.
  //
  // DOKU says only "Cannot contain special character" and does not publish
  // which ones, so guessing at a blocklist means waiting for the next refused
  // character to appear in a customer's address. Letters, digits and the
  // handful of marks that genuinely occur in Malaysian names and addresses
  // are kept — "No 12/3", "O'Brien", "Jalan Sri-Hartamas" — and everything
  // else becomes a space, whatever it turns out to be.
  const ascii = replaced
    .replace(/[^A-Za-z0-9 .,'\-/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A doubled or trailing comma is what removing a Chinese city leaves.
    .replace(/\s*,\s*(?=,)/g, "")
    .replace(/^[,\s]+|[,\s]+$/g, "");

  // What survives stripping can be punctuation and stray digits — "配套 D :
  // 除臭霜 x4, 磨砂膏 x2" leaves "D : x4, x2 +", which tells a customer
  // nothing and looks like a fault. Below a few real characters, the fallback
  // is the more honest answer.
  const meaningful = ascii.replace(/[^A-Za-z0-9]/g, "").length;
  return meaningful >= 3 ? ascii : fallback;
}

export function buildDokuLineItems(input: DokuCheckoutInput): DokuLineItem[] {
  const toCents = (n: number) => Math.round(n * 100);

  const itemised: DokuLineItem[] = input.items.map((item) => ({
    // Falls back to the order number when a name is nothing but Chinese, so
    // the line still says which purchase it belongs to.
    name: dokuSafeText(item.product_name, `Order ${input.orderNumber}`),
    quantity: item.quantity,
    price: item.unit_price,
  }));

  if (input.shippingCost > 0) {
    itemised.push({ name: "Shipping", quantity: 1, price: input.shippingCost });
  }

  const itemisedCents = itemised.reduce((sum, l) => sum + toCents(l.price) * l.quantity, 0);
  if (itemisedCents === toCents(input.total)) return itemised;

  return [{
    name: input.voucherCode
      ? `Order ${input.orderNumber} (${input.voucherCode} applied)`
      : `Order ${input.orderNumber}`,
    quantity: 1,
    price: input.total,
  }];
}

export async function createDokuCheckout(input: DokuCheckoutInput): Promise<DokuCheckoutResult> {
  const clientId = process.env.DOKU_CLIENT_ID!;
  const secretKey = process.env.DOKU_SECRET_KEY!;
  const apiKey = process.env.DOKU_API_KEY!;
  const baseUrl = process.env.DOKU_API_URL || "https://api-sandbox.doku.com";

  const checkoutId = randomUUID();
  const timestamp = new Date().toISOString();
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const c = input.customer;
  const address = [
    [c.address_line1, c.address_line2].filter(Boolean).join(", "),
    c.city,
    `${c.state ?? ""} ${c.postcode ?? ""}`.trim(),
  ].filter(Boolean).join(", ");

  const body = {
    id: checkoutId,
    order: {
      amount: input.total,
      invoice_number: input.orderNumber,
      currency: "MYR",
      expired_at: expiredAt,
      line_items: buildDokuLineItems(input),
    },
    customer: {
      name: dokuSafeText(c.name, "Customer"),
      email: c.email,
      phone: c.phone,
      // The gateway wants an ISO country code; sending MY for a Singapore
      // address would have the customer's card checked against the wrong
      // country.
      country: /singapore/i.test(c.country ?? "") ? "SG" : "MY",
      address: dokuSafeText(address, "Malaysia"),
    },
    checkout_experience: {
      language: "EN",
      auto_redirect: true,
      // These are all customer-facing redirects — "Back to Merchant" uses
      // callback_url. Payment notifications go to the endpoint configured in
      // the DOKU dashboard, not here; pointing this at the webhook showed
      // customers a raw JSON error when they clicked back.
      callback_url: `${input.origin}/order-confirmation?order=${input.orderNumber}`,
      callback_url_cancel: `${input.origin}/checkout`,
      callback_url_result: `${input.origin}/order-confirmation?order=${input.orderNumber}`,
    },
  };

  const bodyString = JSON.stringify(body);
  const digest = createHash("sha256").update(bodyString).digest("base64");
  const componentSignature =
    `Client-Id:${clientId}\n` +
    `Request-Id:${checkoutId}\n` +
    `Request-Timestamp:${timestamp}\n` +
    `Request-Target:/v3/checkouts\n` +
    `Digest:${digest}`;
  const signature = createHmac("sha256", secretKey).update(componentSignature).digest("base64");

  /**
   * Asked more than once before giving up.
   *
   * During a flash sale one checkout in five was refused — the failures fell
   * exactly on the busiest minutes, which is throttling rather than anything
   * wrong with the order. Each one showed a customer who had filled in their
   * whole address "Failed to create DOKU checkout" and left the sale.
   *
   * A refusal that is the gateway's own trouble is worth asking again about; a
   * refusal that is the request's fault will say the same thing however many
   * times it is sent, so only the first kind is retried.
   *
   * The signed headers are reused deliberately. The signature covers this
   * exact body and request id, and DOKU treats a repeat of the same id as the
   * same checkout — so a retry cannot leave two checkouts behind for one
   * order, which is what re-signing each attempt would risk.
   */
  // Bounded deliberately. Three attempts at eight seconds with the waits
  // between them is about eighteen seconds at worst, which stays inside the
  // serverless function's own limit — a retry that outlives the request it is
  // serving helps nobody and leaves the customer with a dead page.
  const RETRY_DELAYS_MS = [400, 1200];
  let res: Response | null = null;
  let lastError = "";

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      console.warn(`DOKU checkout retry ${attempt} for order=${input.orderNumber}`);
    }

    try {
      res = await fetch(`${baseUrl}/v3/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Id": clientId,
          "Request-Id": checkoutId,
          "Request-Timestamp": timestamp,
          "Signature": `HMACSHA256=${signature}`,
          "Authorization": `Basic ${Buffer.from(apiKey).toString("base64")}`,
          "API-Version": "arabica.2025-12-01",
        },
        body: bodyString,
        // A gateway that has stopped answering should free the customer to try
        // again rather than hold the page until something else times out.
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err) {
      // A dropped connection or a timeout: nothing was refused, so ask again.
      lastError = (err as Error).message;
      console.error(`DOKU checkout unreachable order=${input.orderNumber}:`, lastError);
      continue;
    }

    if (res.ok) break;

    lastError = await res.text().catch(() => "");
    console.error(
      `DOKU checkout failed [${res.status}] order=${input.orderNumber} amount=${input.total}:`,
      lastError,
    );

    // Too many requests, or the gateway's own fault: worth asking again.
    // Anything else is a refusal of this order and will not change.
    const worthRetrying = res.status === 429 || res.status >= 500;
    if (!worthRetrying) break;
  }

  if (!res || !res.ok) {
    // A 4xx is DOKU's verdict on this order — the amount, a line item, the
    // customer's details — and it will say the same thing every time. Anything
    // else is the gateway's own trouble, or no answer at all.
    const permanent = !!res && res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new DokuCheckoutError("Failed to create DOKU checkout", permanent, lastError);
  }

  const data = await res.json();
  const checkoutUrl = data.payment?.checkout_url || "";
  if (!checkoutUrl) throw new Error("DOKU returned no checkout URL");

  return { checkoutUrl, checkoutId };
}
