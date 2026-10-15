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

    // Minutes now. A settings page saved before the change sends hours, and
    // must keep meaning the same wait rather than becoming three minutes.
    const delay = Number.isFinite(Number(body.delay_minutes))
      ? Number(body.delay_minutes)
      : Number(body.delay_hours) * 60;

    // The job wakes every five minutes, so a shorter wait is one the schedule
    // cannot keep — it would simply mean "next run".
    if (!Number.isFinite(delay) || delay < 5 || delay > 43_200) {
      return Response.json(
        { error: "The wait must be between 5 minutes and 30 days" },
        { status: 400 },
      );
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
      delay_minutes: Math.round(delay),
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
