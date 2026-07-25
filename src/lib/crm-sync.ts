import { createClient } from "@supabase/supabase-js";

/**
 * Sync a paid order to the Dr.Smells CRM.
 * Called from payment webhook handlers after payment is confirmed.
 */
export async function syncOrderToCRM(orderNumber: string) {
  const crmUrl = process.env.CRM_WEBHOOK_URL;
  const crmSecret = process.env.CRM_WEBHOOK_SECRET;

  if (!crmUrl || !crmSecret) {
    console.warn("[CRM Sync] CRM_WEBHOOK_URL or CRM_WEBHOOK_SECRET not configured, skipping sync");
    return;
  }

  // Fetch the full order from website database
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .single();

  if (error || !order) {
    console.error("[CRM Sync] Failed to fetch order:", orderNumber, error?.message);
    return;
  }

  const shipping = order.shipping || {};
  const items = order.items || [];

  // Map website order to CRM format
  const crmOrder = {
    website_order_id: orderNumber,
    customer_name: shipping.name || "Website Customer",
    phone: shipping.phone || "",
    email: shipping.email || "",
    product: items.map((i: { product_name: string; variation?: string }) =>
      i.variation ? `${i.product_name} (${i.variation})` : i.product_name
    ).join(", ") || "Website Order",
    quantity: items.reduce((sum: number, i: { quantity: number }) => sum + (i.quantity || 1), 0),
    amount: order.total || 0,
    address: shipping.address_line1 || "",
    address2: shipping.address_line2 || "",
    city: shipping.city || "",
    state: shipping.state || "",
    postcode: shipping.postcode || "",
    country: "Malaysia",
    payment: order.payment_method || "Bank",
    notes: `Website Order #${orderNumber} | Payment: ${order.payment_method} | Ref: ${order.payment_reference || "N/A"}`,
    order_items: items.map((i: { product_name: string; variation?: string; quantity: number }) => ({
      product: i.variation ? `${i.product_name} (${i.variation})` : i.product_name,
      name: i.variation ? `${i.product_name} (${i.variation})` : i.product_name,
      quantity: i.quantity || 1,
    })),
  };

  try {
    const res = await fetch(crmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": crmSecret,
      },
      body: JSON.stringify(crmOrder),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[CRM Sync] Failed to sync order to CRM:", res.status, errBody);
    } else {
      const result = await res.json();
      console.log("[CRM Sync] Order synced to CRM:", orderNumber, "->", result.order_id);
    }
  } catch (err) {
    console.error("[CRM Sync] Network error syncing to CRM:", err);
  }
}
