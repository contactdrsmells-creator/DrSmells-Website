import { cookies } from "next/headers";
import { createHmac, createHash } from "crypto";

/**
 * Admin-only DOKU auth probe. Sends a minimal checkout request using each
 * candidate Authorization scheme and reports DOKU's raw response for each, so
 * the working combination can be identified without guessing in production.
 *
 * Returns only DOKU's response — never the credentials themselves.
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

  if (!clientId || !secretKey) {
    return Response.json({ error: "DOKU_CLIENT_ID / DOKU_SECRET_KEY not set" }, { status: 500 });
  }

  const b64 = (s: string) => Buffer.from(s).toString("base64");

  const candidates: { label: string; authorization: string }[] = [
    { label: "Basic base64(secretKey)", authorization: `Basic ${b64(secretKey)}` },
    { label: "Basic base64(secretKey:)", authorization: `Basic ${b64(secretKey + ":")}` },
    { label: "Basic base64(clientId:secretKey)", authorization: `Basic ${b64(`${clientId}:${secretKey}`)}` },
  ];

  if (apiKey) {
    candidates.push(
      { label: "Basic base64(apiKey)", authorization: `Basic ${b64(apiKey)}` },
      { label: "Basic base64(apiKey:)", authorization: `Basic ${b64(apiKey + ":")}` },
    );
  }

  const results = [];

  for (const candidate of candidates) {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const body = {
      id: requestId,
      order: {
        amount: 1,
        invoice_number: `DIAG-${Date.now()}`,
        currency: "MYR",
        line_items: [{ name: "Diagnostic", quantity: 1, price: 1 }],
      },
      customer: { name: "Diagnostic", email: "diagnostic@example.com", country: "MY" },
      checkout_experience: { language: "EN" },
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
          "Authorization": candidate.authorization,
          "API-Version": "arabica.2025-12-01",
        },
        body: bodyString,
      });

      const text = await res.text();
      results.push({ scheme: candidate.label, status: res.status, response: text.slice(0, 600) });
    } catch (err) {
      results.push({ scheme: candidate.label, status: 0, response: String(err) });
    }
  }

  return Response.json({
    base_url: baseUrl,
    client_id_prefix: clientId.slice(0, 8) + "…",
    api_key_configured: !!apiKey,
    results,
  });
}
