import { requirePermission } from "@/lib/admin-auth";
import {
  DEFAULT_AUTOMATION,
  SETTINGS_KEY,
  getSupabase,
  loadAutomationConfig,
} from "@/lib/whatsapp-automation";

/** Placeholder returned in place of the stored key so it never leaves the server. */
const MASK = "••••••••";

export async function GET() {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  const config = await loadAutomationConfig();

  // Send a mask rather than the real key — no reason for it to sit in a browser.
  return Response.json({
    ...config,
    flowbuilder_key: config.flowbuilder_key ? MASK : "",
    flowbuilder_key_set: !!config.flowbuilder_key,
  });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const existing = await loadAutomationConfig();

    const delay = Number(body.delay_hours);

    if (!Number.isFinite(delay) || delay < 0 || delay > 720) {
      return Response.json({ error: "Delay must be between 0 and 720 hours" }, { status: 400 });
    }
    if (body.enabled && !String(body.webhook_url || "").startsWith("https://")) {
      return Response.json({ error: "Webhook URL must be https" }, { status: 400 });
    }

    const enabling = body.enabled === true;
    // Stamp the moment it is switched on, so only orders placed from now on are
    // ever eligible. Re-saving while already enabled keeps the original stamp —
    // otherwise every settings tweak would silently skip orders in flight.
    const activatedAt = enabling
      ? existing.enabled && existing.activated_at
        ? existing.activated_at
        : new Date().toISOString()
      : null;

    const value = {
      enabled: body.enabled === true,
      webhook_url: String(body.webhook_url || DEFAULT_AUTOMATION.webhook_url).trim(),
      // The UI sends the mask back when unchanged — keep what's stored in that case.
      flowbuilder_key:
        !body.flowbuilder_key || body.flowbuilder_key === MASK
          ? existing.flowbuilder_key
          : String(body.flowbuilder_key).trim(),
      trigger_status: String(body.trigger_status || "pending").trim(),
      delay_hours: delay,
      activated_at: activatedAt,
      phone_field: String(body.phone_field || "phone").trim(),
    };

    if (value.enabled && !value.flowbuilder_key) {
      return Response.json({ error: "Flowbuilder key is required to enable" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: SETTINGS_KEY, value }, { onConflict: "key" });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
