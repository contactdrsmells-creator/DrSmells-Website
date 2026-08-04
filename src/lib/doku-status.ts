import { createHmac, randomUUID } from "crypto";

/**
 * Asking DOKU what happened to a payment.
 *
 * Contract established empirically with /api/admin/doku-status-probe against a
 * known-paid and a known-failed invoice — not from the documentation, which was
 * wrong about authentication and amount format when checkout was built:
 *
 *   GET https://api.doku.com/orders/v1/status/{invoice_number}
 *   Signed WITHOUT a Digest line. Including one — even a SHA-256 of the empty
 *   string — is rejected with "Invalid Header Signature".
 *   The API key authenticates (Basic), the secret key only signs (HMAC).
 *
 * Two things the probe revealed that shape how this is used:
 *
 *   order.status was "ORDER_GENERATED" for both the paid and the unpaid
 *   invoice, so it says nothing about payment. transaction.status is the field
 *   that matters.
 *
 *   An FPX payment that timed out — shown as Failed in DOKU's own dashboard —
 *   comes back as PENDING here, not FAILED. So this can confirm that money
 *   arrived, but it cannot be trusted to declare a payment dead. Only SUCCESS
 *   is ever acted on.
 */

export interface DokuPaymentStatus {
  ok: boolean;
  /** Raw transaction.status: SUCCESS, PENDING, FAILED… */
  status: string | null;
  /** True only for a confirmed, completed payment. */
  paid: boolean;
  /** Amount DOKU holds for this invoice, for checking against the order. */
  amount: number | null;
  transactionId: string | null;
  channel: string | null;
  error?: string;
}

export function isDokuStatusConfigured(): boolean {
  return !!(process.env.DOKU_CLIENT_ID && process.env.DOKU_SECRET_KEY && process.env.DOKU_API_KEY);
}

export async function getDokuPaymentStatus(invoiceNumber: string): Promise<DokuPaymentStatus> {
  const clientId = process.env.DOKU_CLIENT_ID!;
  const secretKey = process.env.DOKU_SECRET_KEY!;
  const apiKey = process.env.DOKU_API_KEY!;
  const baseUrl = process.env.DOKU_API_URL || "https://api-sandbox.doku.com";

  const target = `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`;
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  // No Digest line: a GET has no body, and including the line fails signing.
  const componentSignature = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`,
  ].join("\n");

  const signature = createHmac("sha256", secretKey).update(componentSignature).digest("base64");

  try {
    const res = await fetch(`${baseUrl}${target}`, {
      method: "GET",
      headers: {
        "Client-Id": clientId,
        "Request-Id": requestId,
        "Request-Timestamp": timestamp,
        "Signature": `HMACSHA256=${signature}`,
        "Authorization": `Basic ${Buffer.from(apiKey).toString("base64")}`,
        "API-Version": "arabica.2025-12-01",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: null,
        paid: false,
        amount: null,
        transactionId: null,
        channel: null,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const status = data?.transaction?.status ?? null;
    const state = data?.transaction?.state ?? null;

    const amountRaw = data?.transaction?.amount ?? data?.order?.amount ?? null;
    const amount = amountRaw === null ? null : Number(amountRaw);

    return {
      ok: true,
      status,
      // Both conditions, because only a completed payment may mark an order
      // paid. PAYMENT_DONE was the state on the confirmed card payment.
      paid: status === "SUCCESS" && (state === null || state === "PAYMENT_DONE"),
      amount: Number.isFinite(amount as number) ? (amount as number) : null,
      transactionId: data?.transaction?.original_request_id ?? null,
      channel: data?.channel?.id ?? data?.service?.id ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      paid: false,
      amount: null,
      transactionId: null,
      channel: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
