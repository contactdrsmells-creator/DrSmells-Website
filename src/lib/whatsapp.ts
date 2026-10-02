/**
 * Sending a login code over WhatsApp, from the shop's own number.
 *
 * Meta requires a one-time code to go through an Authentication-category
 * template, approved separately from the order templates the CRM already
 * sends. A template that has not been approved is refused at the API, so the
 * reason Meta gives is logged in full — it is the only thing that says what to
 * fix, and it never reaches the customer.
 *
 * Needs, on this project rather than the CRM's:
 *   WA_PHONE_NUMBER_ID  – the sending number's id
 *   WA_ACCESS_TOKEN     – a permanent system-user token
 *   WA_OTP_TEMPLATE     – the approved template's name
 *   WA_OTP_LANGUAGE     – its language code (default en)
 *   WA_OTP_HAS_BUTTON   – "true" when the template carries a copy-code button,
 *                         which takes the code a second time as its own
 *                         parameter. Wrong either way is a refusal from Meta,
 *                         so it is a setting rather than a guess.
 */

const BASE = "https://graph.facebook.com/v19.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN);
}

export async function sendLoginCode(
  phone: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_ACCESS_TOKEN;
  const template = process.env.WA_OTP_TEMPLATE || "login_code";
  const language = process.env.WA_OTP_LANGUAGE || "en";

  if (!phoneId || !token) {
    console.error("[WhatsApp] WA_PHONE_NUMBER_ID or WA_ACCESS_TOKEN is not set");
    return { ok: false, error: "whatsapp_not_configured" };
  }

  const components: Record<string, unknown>[] = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];
  if (process.env.WA_OTP_HAS_BUTTON === "true") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }

  try {
    const res = await fetch(`${BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: { name: template, language: { code: language }, components },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[WhatsApp] Code to ${phone} refused (${res.status}):`, detail);
      return { ok: false, error: "send_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[WhatsApp] Could not reach Meta:", (err as Error).message);
    return { ok: false, error: "send_failed" };
  }
}
