import { requirePermission } from "@/lib/admin-auth";
import { createHmac, createHash } from "crypto";

/**
 * Admin-only DOKU probe.
 *
 * Auth is settled: the API Key authenticates (Basic base64(apiKey)); the Secret
 * Key only signs. See git history for the evidence.
 *
 * Amount magnitude is also settled: DOKU takes ringgit, not minor units. Note
 * that the API accepts any representation and echoes it back unchanged, so the
 * response alone proves nothing — this was confirmed by opening the hosted
 * checkout page, where 1234 rendered as "RM 1,234.00" and 12.34 as "RM 12.34".
 * Anything checked here should be verified the same way.
 *
 * Returns only DOKU's responses — never the credentials themselves.
 */
export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const clientId = process.env.DOKU_CLIENT_ID;
  const secretKey = process.env.DOKU_SECRET_KEY;
  const apiKey = process.env.DOKU_API_KEY;
  const baseUrl = process.env.DOKU_API_URL || "https://api-sandbox.doku.com";

  if (!clientId || !secretKey || !apiKey) {
    return Response.json(
      { error: "DOKU_CLIENT_ID / DOKU_SECRET_KEY / DOKU_API_KEY must all be set" },
      { status: 500 },
    );
  }

  const authorization = `Basic ${Buffer.from(apiKey).toString("base64")}`;

  // Amount magnitude is settled: DOKU takes ringgit (sending 1234 rendered
  // "RM 1,234.00" on the hosted page, 12.34 rendered "RM 12.34").
  //
  // Open question: order.amount is products + shipping - discount, while
  // line_items lists products only, so the two disagree on any order with
  // shipping or a voucher. The hosted page renders a Subtotal from line_items,
  // so a mismatch either gets rejected or shows the customer a total that
  // contradicts the amount charged. These variants establish which.
  const variants: { label: string; amount: unknown; lines: unknown[] }[] = [
    {
      label: "A: mismatch — amount 70.90, lines total 64.90 (current behaviour w/ shipping)",
      amount: 70.9,
      lines: [{ name: "Anti-Odour Cream", quantity: 1, price: 64.9 }],
    },
    {
      label: "B: matched — amount 70.90, lines 64.90 + shipping 6.00",
      amount: 70.9,
      lines: [
        { name: "Anti-Odour Cream", quantity: 1, price: 64.9 },
        { name: "Shipping", quantity: 1, price: 6.0 },
      ],
    },
    {
      label: "C: matched w/ negative discount line — amount 60.90",
      amount: 60.9,
      lines: [
        { name: "Anti-Odour Cream", quantity: 1, price: 64.9 },
        { name: "Shipping", quantity: 1, price: 6.0 },
        { name: "Discount (TESTFREES)", quantity: 1, price: -10.0 },
      ],
    },
  ];

  const results: Record<string, unknown>[] = [];

  for (const variant of variants) {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const body = {
      id: requestId,
      order: {
        amount: variant.amount,
        invoice_number: `DIAG-${Date.now()}-${results.length}`,
        currency: "MYR",
        expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        line_items: variant.lines,
      },
      customer: {
        name: "Diagnostic",
        email: "diagnostic@example.com",
        phone: "0100000000",
        country: "MY",
        address: "1 Test Street, Kuala Lumpur, Selangor 50000",
      },
      checkout_experience: {
        language: "EN",
        auto_redirect: true,
        callback_url: "https://drsmells.com.my/api/webhooks/doku",
        callback_url_cancel: "https://drsmells.com.my/checkout",
        callback_url_result: "https://drsmells.com.my/order-confirmation",
      },
    };

    const bodyString = JSON.stringify(body);
    const digest = createHash("sha256").update(bodyString).digest("base64");
    const componentSignature = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/v3/checkouts\nDigest:${digest}`;
    const signature = createHmac("sha256", secretKey).update(componentSignature).digest("base64");

    try {
      const res = await fetch(`${baseUrl}/v3/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Id": clientId,
          "Request-Id": requestId,
          "Request-Timestamp": timestamp,
          "Signature": `HMACSHA256=${signature}`,
          "Authorization": authorization,
          "API-Version": "arabica.2025-12-01",
        },
        body: bodyString,
      });

      const text = await res.text();

      if (res.ok) {
        // Surface what DOKU actually recorded — this is the magnitude check.
        let echoedAmount: unknown = null;
        let checkoutUrl: unknown = null;
        try {
          const parsed = JSON.parse(text);
          echoedAmount = parsed?.order?.amount ?? null;
          checkoutUrl = parsed?.payment?.checkout_url ?? null;
        } catch { /* fall through to raw */ }

        results.push({
          variant: variant.label,
          sent: variant.amount,
          status: res.status,
          accepted: true,
          doku_recorded_amount: echoedAmount,
          checkout_url: checkoutUrl,
          raw: text.slice(0, 400),
        });
      } else {
        results.push({
          variant: variant.label,
          sent: variant.amount,
          status: res.status,
          accepted: false,
          response: text.slice(0, 300),
        });
      }
    } catch (err) {
      results.push({ variant: variant.label, sent: variant.amount, status: 0, accepted: false, response: String(err) });
    }
  }

  return Response.json({
    base_url: baseUrl,
    note: "Amount is in RINGGIT (confirmed on hosted page). These variants test line_items vs order.amount consistency. Open each checkout_url and compare the displayed Subtotal/Total against the amount sent.",
    results,
  });
}
