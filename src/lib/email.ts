import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

/**
 * Order confirmation email.
 *
 * Sending is deliberately fail-soft: this runs inside payment webhooks, and a
 * mail outage must never cause a webhook to error, because the gateway would
 * then retry and we would double-process a real payment. Every failure is
 * logged and swallowed.
 */

interface OrderItem {
  product_name: string;
  variation?: string;
  quantity: number;
  unit_price: number;
  subscription?: { interval_months: number } | null;
}

interface OrderRecord {
  order_number: string;
  items: OrderItem[];
  shipping: {
    name?: string;
    email?: string;
    phone?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
  subtotal: number;
  shipping_cost: number;
  discount: number;
  voucher_code: string | null;
  total: number;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Order data is customer-supplied; escape before it goes into HTML. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const rm = (n: number) => `RM ${Number(n || 0).toFixed(2)}`;

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  });
}

function buildHtml(order: OrderRecord): string {
  const s = order.shipping || {};

  const rows = (order.items || [])
    .map((item) => {
      const label = item.variation
        ? `${esc(item.product_name)} <span style="color:#7a7a6d">(${esc(item.variation)})</span>`
        : esc(item.product_name);
      const recurring = item.subscription
        ? `<div style="color:#7a7a6d;font-size:12px">Recurring every ${esc(item.subscription.interval_months)} month(s)</div>`
        : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee">
            ${label}${recurring}
            <div style="color:#7a7a6d;font-size:12px">Qty ${esc(item.quantity)}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
            ${rm(item.unit_price * item.quantity)}
          </td>
        </tr>`;
    })
    .join("");

  const addressLines = [s.address_line1, s.address_line2, [s.postcode, s.city].filter(Boolean).join(" "), s.state]
    .filter(Boolean)
    .map((line) => esc(line))
    .join("<br>");

  const discountRow = order.discount > 0
    ? `<tr><td style="padding:3px 0;color:#2e7d32">Discount${order.voucher_code ? ` (${esc(order.voucher_code)})` : ""}</td>
         <td style="padding:3px 0;text-align:right;color:#2e7d32">-${rm(order.discount)}</td></tr>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#3d4127">
    <h1 style="font-size:22px;margin:0 0 4px">Thank you for your order!</h1>
    <p style="color:#7a7a6d;margin:0 0 20px">We've received your payment and are getting your order ready.</p>

    <div style="background:#f6f7f2;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <div style="font-size:12px;color:#7a7a6d">Order Number</div>
      <div style="font-size:17px;font-weight:600">${esc(order.order_number)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px">
      <tr><td style="padding:3px 0;color:#7a7a6d">Subtotal</td>
          <td style="padding:3px 0;text-align:right">${rm(order.subtotal)}</td></tr>
      ${discountRow}
      <tr><td style="padding:3px 0;color:#7a7a6d">Shipping</td>
          <td style="padding:3px 0;text-align:right">${order.shipping_cost > 0 ? rm(order.shipping_cost) : "FREE"}</td></tr>
      <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #ddd">Total Paid</td>
          <td style="padding:10px 0 0;text-align:right;font-weight:700;border-top:1px solid #ddd">${rm(order.total)}</td></tr>
    </table>

    <h2 style="font-size:15px;margin:26px 0 6px">Delivery Address</h2>
    <div style="font-size:14px;line-height:1.6;color:#5a5e48">
      ${esc(s.name)}<br>${addressLines}<br>${esc(s.phone)}
    </div>

    <p style="font-size:13px;color:#7a7a6d;margin-top:26px;line-height:1.6">
      We'll send your tracking number once the parcel ships. Just reply to this email if you need anything.
    </p>
    <p style="font-size:12px;color:#a0a094;margin-top:20px">Dr.Smells &middot; LIFE BIO LAB SDN. BHD.</p>
  </div>`;
}

/**
 * Sends the confirmation for a paid order, exactly once.
 *
 * Both the payment webhook and the on-page session verifier mark an order paid,
 * so this claims the send first via a conditional update: only the caller that
 * actually flips confirmation_email_sent from false to true proceeds. Without
 * that, a customer can receive the same confirmation twice.
 */
export async function sendOrderConfirmationEmail(orderNumber: string): Promise<void> {
  try {
    const transport = getTransport();
    if (!transport) {
      console.warn(`[Email] SMTP not configured — skipping confirmation for ${orderNumber}`);
      return;
    }

    const supabase = getSupabase();

    const { data: claimed, error: claimError } = await supabase
      .from("orders")
      .update({ confirmation_email_sent: true })
      .eq("order_number", orderNumber)
      .eq("confirmation_email_sent", false)
      .select("order_number, items, shipping, subtotal, shipping_cost, discount, voucher_code, total");

    if (claimError) {
      console.error(`[Email] Could not claim send for ${orderNumber}:`, claimError.message);
      return;
    }
    if (!claimed?.length) return; // already sent by the other path

    const order = claimed[0] as unknown as OrderRecord;
    const to = order.shipping?.email;
    if (!to) {
      console.warn(`[Email] No customer email on ${orderNumber}`);
      return;
    }

    const from = process.env.MAIL_FROM || process.env.SMTP_USER!;

    await transport.sendMail({
      from: `Dr.Smells <${from}>`,
      to,
      bcc: process.env.MAIL_BCC || undefined,
      replyTo: from,
      subject: `Order confirmed — ${order.order_number}`,
      html: buildHtml(order),
    });

    console.log(`[Email] Confirmation sent for ${orderNumber}`);
  } catch (err) {
    // Never rethrow: this runs inside payment webhooks.
    console.error(`[Email] Failed to send confirmation for ${orderNumber}:`, err);
  }
}
