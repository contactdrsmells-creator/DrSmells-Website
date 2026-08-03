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
  };
  /** Origin of the site, used for the customer-facing redirects. */
  origin: string;
}

export interface DokuCheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
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
export function buildDokuLineItems(input: DokuCheckoutInput): DokuLineItem[] {
  const toCents = (n: number) => Math.round(n * 100);

  const itemised: DokuLineItem[] = input.items.map((item) => ({
    name: item.product_name,
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
      name: c.name,
      email: c.email,
      phone: c.phone,
      country: "MY",
      address,
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

  const res = await fetch(`${baseUrl}/v3/checkouts`, {
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
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `DOKU checkout failed [${res.status}] order=${input.orderNumber} amount=${input.total}:`,
      errText,
    );
    throw new Error("Failed to create DOKU checkout");
  }

  const data = await res.json();
  const checkoutUrl = data.payment?.checkout_url || "";
  if (!checkoutUrl) throw new Error("DOKU returned no checkout URL");

  return { checkoutUrl, checkoutId };
}
