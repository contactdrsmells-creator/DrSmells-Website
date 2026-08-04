import { createHash, createHmac, randomUUID } from "crypto";
import { requirePermission } from "@/lib/admin-auth";

/**
 * Establishes how to ask DOKU for a payment's status.
 *
 * DOKU's documentation proved unreliable when the checkout integration was
 * built — the API key authenticates while the secret key only signs, and
 * amounts are in ringgit rather than cents, neither of which matched the docs.
 * Guessing here would be worse: a status check that wrongly reports "paid"
 * means shipping goods for free.
 *
 * So this tries the plausible endpoints and signature shapes and reports what
 * each returns verbatim. It is read-only — nothing is charged, refunded, or
 * written to an order.
 *
 * Verified against a known pair before anything is built on it:
 *   /api/admin/doku-status-probe?invoice=120WWV   (was paid — Cards, approved)
 *   /api/admin/doku-status-probe?invoice=119WSE   (failed — FPX timeout)
 *
 * A usable endpoint must tell those two apart.
 */
const CANDIDATE_PATHS = (invoice: string) => [
  `/orders/v1/status/${invoice}`,
  `/orders/v1/status?invoice_number=${invoice}`,
  `/v3/checkouts/${invoice}`,
  `/v3/orders/${invoice}`,
  `/checkout/v1/payment/${invoice}`,
  `/payments/v1/status/${invoice}`,
];

export async function GET(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const clientId = process.env.DOKU_CLIENT_ID;
  const secretKey = process.env.DOKU_SECRET_KEY;
  const apiKey = process.env.DOKU_API_KEY;
  const baseUrl = process.env.DOKU_API_URL || "https://api-sandbox.doku.com";

  if (!clientId || !secretKey || !apiKey) {
    return Response.json({ error: "DOKU is not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const invoice = searchParams.get("invoice");
  if (!invoice) {
    return Response.json(
      { error: "Pass ?invoice=<order number>, e.g. ?invoice=120WWV" },
      { status: 400 },
    );
  }

  /**
   * DOKU signs a Digest of the request body. A GET has no body, and the docs
   * are ambiguous about whether the Digest line is then empty or absent
   * entirely — so both are tried and reported.
   */
  function sign(target: string, withEmptyDigest: boolean) {
    const requestId = randomUUID();
    const timestamp = new Date().toISOString();

    const lines = [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${timestamp}`,
      `Request-Target:${target}`,
    ];
    if (withEmptyDigest) {
      lines.push(`Digest:${createHash("sha256").update("").digest("base64")}`);
    }

    const signature = createHmac("sha256", secretKey!)
      .update(lines.join("\n"))
      .digest("base64");

    return {
      "Client-Id": clientId!,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      "Signature": `HMACSHA256=${signature}`,
      // Proven previously: the API key authenticates, the secret key only signs.
      "Authorization": `Basic ${Buffer.from(apiKey!).toString("base64")}`,
      "API-Version": "arabica.2025-12-01",
    };
  }

  const attempts: Record<string, unknown>[] = [];

  for (const path of CANDIDATE_PATHS(invoice)) {
    for (const withEmptyDigest of [true, false]) {
      const target = path;
      try {
        const res = await fetch(`${baseUrl}${target}`, {
          method: "GET",
          headers: sign(target, withEmptyDigest),
        });

        const text = await res.text().catch(() => "");
        attempts.push({
          path,
          digest: withEmptyDigest ? "empty-sha256" : "omitted",
          http_status: res.status,
          // Truncated: a 404 HTML page would otherwise bury the useful results.
          body: text.slice(0, 600),
        });
      } catch (err) {
        attempts.push({
          path,
          digest: withEmptyDigest ? "empty-sha256" : "omitted",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const promising = attempts.filter((a) => a.http_status === 200);

  return Response.json({
    invoice,
    base_url: baseUrl,
    note:
      "Run this for a known-paid invoice and a known-failed one. An endpoint is only usable if it reports the two differently.",
    endpoints_returning_200: promising.length,
    promising,
    all_attempts: attempts,
  });
}
