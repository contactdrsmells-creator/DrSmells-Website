/**
 * Allocates the next order number.
 *
 * Lives here rather than in the checkout route because subscription renewals
 * need one too — a renewal is a fresh order to pack, and it must be numbered
 * from the same sequence as everything else or the CRM sees a gap.
 *
 * The CRM owns the counter. When it cannot be reached the number falls back to
 * a date-based id, which the CRM's own numbering deliberately skips so a
 * fallback can never drag the sequence up.
 */
export async function generateOrderNumber(): Promise<string> {
  try {
    const crmUrl = process.env.CRM_WEBHOOK_URL;
    if (crmUrl) {
      const crmBase = new URL(crmUrl).origin;
      const crmRes = await fetch(`${crmBase}/api/webhook/next-order-id`, {
        headers: { "x-webhook-secret": process.env.CRM_WEBHOOK_SECRET || "" },
      });
      if (crmRes.ok) {
        const crmData = await crmRes.json();
        if (crmData.next_id) {
          const randomLetters = String.fromCharCode(
            65 + Math.floor(Math.random() * 26),
            65 + Math.floor(Math.random() * 26),
          );
          return `${crmData.next_id}W${randomLetters}`;
        }
      }
    }
  } catch {
    console.error("[Order] Failed to fetch CRM next order ID");
  }

  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `DS-${datePart}-${rand}`;
}
