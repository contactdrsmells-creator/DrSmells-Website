import { createClient } from "@supabase/supabase-js";

/**
 * The unpaid order behind a /pay/<number> link, as the customer may see it.
 *
 * Only what is needed to pay is returned: the items, the amounts and a first
 * name. Anyone holding an order number can open the link, so the phone,
 * email and address stay out of it.
 */

export const PAID_STATUSES = ["paid", "processing", "shipped", "completed", "delivered"];

export function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

export interface ResumeItem {
  product_name: string;
  variation?: string;
  quantity: number;
  unit_price: number;
  subscription?: { price: number; interval_months: number };
}

export interface ResumeOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  items: ResumeItem[];
  shipping: { name?: string } | null;
  subtotal: number | null;
  shipping_cost: number | null;
  discount: number | null;
  points_discount?: number | null;
  voucher_code: string | null;
  total: number;
  created_at: string;
}

export function cleanOrderNumber(raw: unknown): string {
  const s = String(raw || "").trim().toUpperCase();
  return /^[A-Z0-9-]{3,30}$/.test(s) ? s : "";
}

export function isPaid(order: Pick<ResumeOrderRow, "status" | "payment_status">): boolean {
  return order.payment_status === "paid" || PAID_STATUSES.includes(String(order.status));
}

export function itemsSubtotal(order: ResumeOrderRow): number {
  if (order.subtotal != null && Number(order.subtotal) > 0) return Number(order.subtotal);
  return (order.items || []).reduce(
    (sum, i) => sum + Number(i.subscription?.price ?? i.unit_price ?? 0) * Number(i.quantity || 0),
    0,
  );
}

export async function loadResumeOrder(orderNumber: string): Promise<ResumeOrderRow | null> {
  if (!orderNumber) return null;
  const { data } = await serviceSupabase()
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();
  return (data as ResumeOrderRow) || null;
}

export function publicSummary(order: ResumeOrderRow) {
  const first = String(order.shipping?.name || "").trim().split(/\s+/)[0] || "";
  return {
    order_number: order.order_number,
    paid: isPaid(order),
    first_name: first.slice(0, 40),
    items: (order.items || []).map((i) => ({
      name: i.product_name,
      variation: i.variation || "",
      quantity: Number(i.quantity || 0),
      line_total: Math.round(Number(i.subscription?.price ?? i.unit_price ?? 0) * Number(i.quantity || 0) * 100) / 100,
    })),
    subtotal: itemsSubtotal(order),
    discount: Number(order.discount || 0),
    points_discount: Number(order.points_discount || 0),
    shipping_cost: Number(order.shipping_cost || 0),
    voucher_code: order.voucher_code || null,
    total: Number(order.total || 0),
  };
}
