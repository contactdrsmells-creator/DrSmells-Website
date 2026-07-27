import { cookies } from "next/headers";
import { createHmac, createHash } from "crypto";

/**
 * Admin-only DOKU probe.
 *
 * Auth is settled: the API Key authenticates (Basic base64(apiKey)); the Secret
 * Key only signs. See git history for the evidence.
 *
 * This now pins down the expected amount format. Getting it wrong is dangerous
 * in opposite directions — sending minor units when DOKU wants ringgit
 * undercharges 100x, and the reverse overcharges 100x — so rather than assume,
 * each representation is sent for a known RM 12.34 order and DOKU's own answer
 * decides it. A variant that succeeds echoes back the amount it recorded, which
 * is what actually confirms the magnitude.
 *
 * Returns only DOKU's responses — never the credentials themselves.
 */
export async function GET() {
  const cookieStore = await cookies();
  if (!cookieStore.get("admin_token")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // One real-world-ish amount, expressed every plausible way. 12.34 is chosen so
  // ringgit and minor units can't be confused for each other in the response.
  const variants: { label: string; amount: unknown; price: unknown }[] = [
    { label: "minor units, integer (1234 = RM12.34)", amount: 1234, price: 1234 },
    { label: "ringgit, decimal (12.34)", amount: 12.34, price: 12.34 },
    { label: "ringgit, string (\"12.34\")", amount: "12.34", price: "12.34" },
    { label: "ringgit, whole integer (12)", amount: 12, price: 12 },
    { label: "minor units, string (\"1234\")", amount: "1234", price: "1234" },
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
        line_items: [{ name: "Diagnostic", quantity: 1, price: variant.price }],
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
    note: "Order sent is RM 12.34. For any accepted variant, check doku_recorded_amount to confirm the magnitude before trusting it.",
    results,
  });
}
