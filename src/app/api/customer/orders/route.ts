import { getCustomerSession, supabaseAdmin } from "@/lib/customer-auth";
import { getSiteSettings } from "@/lib/data";

/**
 * Every order this member has placed, wherever they placed it, and where each
 * parcel is.
 *
 * Two things had to be joined. The shop knows what was bought here but never
 * learns the tracking code, which is written in the CRM when the label is
 * made. The CRM knows about the order taken over WhatsApp, which the shop has
 * never heard of at all. A member logging in expects both, and until now the
 * only way to get either was to ask us.
 *
 * The shop's own record wins where the two describe the same order: it holds
 * the voucher, the discount and what was actually charged. Only the tracking
 * is taken from the CRM, which is the one fact the shop does not have.
 *
 * The CRM being unreachable costs the tracking codes and the chat orders, not
 * the page — somebody checking an order they placed here should not be told
 * to come back later because a second system is down.
 */

interface Line {
  name: string;
  variation: string | null;
  quantity: number;
}

interface CrmOrder {
  order_id: string;
  channel: string;
  status: string;
  amount: number;
  tracking_code: string | null;
  items: Line[];
  created_at: string;
}

/** Where a tracking code can be looked up, with the code put into the link. */
function trackingLink(template: string, code: string): string | null {
  if (!code || !template) return null;
  const url = template.includes("{code}")
    ? template.replace(/\{code\}/g, encodeURIComponent(code))
    : `${template}${encodeURIComponent(code)}`;
  // Only ever an ordinary web address. A template is admin-editable, and a
  // link is rendered into the page, so anything else must not get through.
  return /^https?:\/\//i.test(url) ? url : null;
}

async function fromCrm(phone: string): Promise<CrmOrder[]> {
  const url = process.env.CRM_WEBHOOK_URL;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return [];

  // The orders webhook and this share a host; only the last path segment
  // differs, so the address is derived rather than configured twice.
  const endpoint = url.replace(/\/[^/]*$/, "/customer-shipments");

  try {
    const res = await fetch(`${endpoint}?phone=${encodeURIComponent(phone)}`, {
      headers: { "x-webhook-secret": secret },
    });
    if (!res.ok) {
      console.error("[Orders] CRM refused the shipment lookup:", res.status);
      return [];
    }
    return (await res.json())?.orders || [];
  } catch (err) {
    console.error("[Orders] CRM unreachable:", (err as Error).message);
    return [];
  }
}

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ orders: [] }, { status: 401 });

  const db = supabaseAdmin();

  const [{ data: mine }, crm, settings] = await Promise.all([
    db
      .from("orders")
      .select("order_number, status, payment_status, total, discount, voucher_code, items, created_at")
      .eq("customer_id", session.id)
      .order("created_at", { ascending: false })
      .limit(50),
    fromCrm(session.phone),
    getSiteSettings().catch(() => ({}) as Record<string, Record<string, string>>),
  ]);

  // DHL eCommerce by default, since that is what the labels are made with.
  // Editable in Site Settings, because the courier is not a fact about code.
  const template =
    settings?.shipping?.tracking_url || "https://ecommerceportal.dhl.com/track/?ref={code}";

  const trackingFor = new Map<string, string | null>();
  const chatOnly = new Map<string, CrmOrder>();
  for (const order of crm) {
    trackingFor.set(order.order_id, order.tracking_code);
    chatOnly.set(order.order_id, order);
  }

  const orders = (mine || []).map((order) => {
    // Matched to the CRM by order number, which a website order carries in
    // both systems. Once matched it is no longer a chat order.
    chatOnly.delete(order.order_number);
    const code = trackingFor.get(order.order_number) || null;
    return {
      order_number: order.order_number,
      source: "website" as const,
      status: order.status,
      payment_status: order.payment_status,
      total: Number(order.total) || 0,
      voucher_code: order.voucher_code || null,
      items: (Array.isArray(order.items) ? order.items : []).map(
        (item: { product_name?: string; variation?: string; quantity?: number; subscription?: unknown }) => ({
          name: item.product_name || "Item",
          variation: item.variation || null,
          quantity: item.quantity || 1,
          subscription: Boolean(item.subscription),
        }),
      ),
      tracking_code: code,
      tracking_url: code ? trackingLink(template, code) : null,
      created_at: order.created_at,
    };
  });

  // What they bought over chat, which the shop has no record of.
  for (const order of chatOnly.values()) {
    orders.push({
      order_number: order.order_id,
      source: "chat" as unknown as "website",
      status: order.status,
      payment_status: "paid",
      total: order.amount,
      voucher_code: null,
      items: (order.items || []).map((line) => ({ ...line, subscription: false })),
      tracking_code: order.tracking_code,
      tracking_url: order.tracking_code ? trackingLink(template, order.tracking_code) : null,
      created_at: order.created_at,
    });
  }

  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return Response.json({ orders });
}
