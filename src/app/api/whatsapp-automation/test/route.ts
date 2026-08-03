import { requirePermission } from "@/lib/admin-auth";
import { loadAutomationConfig, normalisePhone, sendToStrive } from "@/lib/whatsapp-automation";

/**
 * Admin-only: fires one test payload at Strive so the webhook, key and flow can
 * be verified without waiting for a real order to go unpaid.
 *
 * Sends regardless of the enabled flag — the point is to test before enabling.
 */
export async function POST(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const { phone } = await request.json().catch(() => ({ phone: "" }));
  const normalised = normalisePhone(phone);
  if (!normalised) {
    return Response.json({ error: "Enter a valid Malaysian phone number" }, { status: 400 });
  }

  const config = await loadAutomationConfig();
  if (!config.flowbuilder_key || !config.webhook_url) {
    return Response.json({ error: "Save the webhook URL and key first" }, { status: 400 });
  }

  const result = await sendToStrive(config, {
    [config.phone_field]: normalised,
    customer_name: "Test",
    order_id: "TEST-0000",
    amount: "0.00",
    payment_url: "https://drsmells.com.my",
  });

  return Response.json({
    ok: result.ok,
    sent_to: normalised,
    strive_status: result.status,
    strive_response: result.body,
  });
}
