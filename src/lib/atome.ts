/**
 * Creating an Atome (buy now, pay later) payment.
 *
 * Built against Atome's published OpenAPI spec (doc.apaylater.com/v2), whose
 * contract differs from DOKU's in three ways that matter here:
 *
 *  - Amounts are integers in sen, not ringgit — 1234 is RM12.34 — and the
 *    minimum is RM10.00. Sending ringgit would charge one hundredth of the
 *    order and Atome would accept it happily.
 *  - The customer's mobile number is required, in E.164 form with a plus.
 *  - `referenceId` makes creation idempotent, so the order number is used:
 *    retrying a checkout can never open two payments for one order.
 *
 * The status callback carries only a referenceId. It is never trusted:
 * `getAtomePayment` asks Atome directly, over our own credentials, and only
 * that answer decides whether an order is marked paid.
 */

export interface AtomeCheckoutInput {
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
  origin: string;
}

export interface AtomeCheckoutResult {
  checkoutUrl: string;
  referenceId: string;
}

/** Atome's floor. Below this the option should not even be offered. */
export const ATOME_MIN_TOTAL_MYR = 10;

const API_URL = () => process.env.ATOME_API_URL || "https://api.apaylater.com/v2";

export function isAtomeConfigured(): boolean {
  return !!(process.env.ATOME_ACCESS_KEY && process.env.ATOME_PASSWORD);
}

function authHeader(): string {
  const pair = `${process.env.ATOME_ACCESS_KEY}:${process.env.ATOME_PASSWORD}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

const toSen = (ringgit: number) => Math.round(ringgit * 100);

/** "+60123456789" — Atome requires E.164 with the plus. */
function toE164(phone: string | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return `+${digits}`;
  if (digits.startsWith("0")) return `+60${digits.slice(1)}`;
  return `+${digits}`;
}

export async function createAtomePayment(input: AtomeCheckoutInput): Promise<AtomeCheckoutResult> {
  const c = input.customer;

  const items = input.items.map((item, index) => ({
    itemId: `ITEM-${index + 1}`,
    name: String(item.product_name).slice(0, 250),
    quantity: item.quantity,
    price: toSen(item.unit_price),
  }));

  const body = {
    referenceId: input.orderNumber,
    currency: "MYR",
    amount: toSen(input.total),
    callbackUrl: `${input.origin}/api/webhooks/atome`,
    paymentResultUrl: `${input.origin}/order-confirmation?order=${input.orderNumber}`,
    paymentCancelUrl: `${input.origin}/checkout`,
    merchantReferenceId: input.orderNumber,
    customerInfo: {
      mobileNumber: toE164(c.phone),
      fullName: c.name || undefined,
      email: c.email || undefined,
    },
    shippingAddress: {
      countryCode: "MY",
      lines: [c.address_line1, c.address_line2, c.city, c.state].filter(Boolean) as string[],
      postCode: c.postcode || "",
    },
    ...(input.shippingCost > 0 ? { shippingAmount: toSen(input.shippingCost) } : {}),
    ...(input.voucherCode ? { voucherCode: input.voucherCode } : {}),
    items,
  };

  const res = await fetch(`${API_URL()}/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.redirectUrl) {
    // Atome's code+message name the exact cause (AMOUNT_NOT_VALID and friends);
    // losing them would leave "failed to create" as the only clue.
    throw new Error(`Atome ${res.status}: ${data?.code || ""} ${data?.message || "no redirectUrl in response"}`.trim());
  }

  return { checkoutUrl: data.redirectUrl, referenceId: input.orderNumber };
}

export interface AtomePaymentStatus {
  status: "PROCESSING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  amount: number;
  transactionId?: string;
}

/** The payment as Atome records it — the only version of events to act on. */
export async function getAtomePayment(referenceId: string): Promise<AtomePaymentStatus> {
  const res = await fetch(`${API_URL()}/payments/${encodeURIComponent(referenceId)}`, {
    headers: { authorization: authHeader() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    throw new Error(`Atome ${res.status}: ${data?.code || ""} ${data?.message || "could not read payment"}`.trim());
  }

  return {
    status: data.status,
    amount: data.amount,
    transactionId: data.paymentTransaction?.transactionId,
  };
}
