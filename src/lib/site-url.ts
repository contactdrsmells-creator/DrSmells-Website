/**
 * The address customers should see.
 *
 * Anything composed for a customer — a payment link in a WhatsApp reminder, a
 * return URL handed to a gateway — has to use the shop's own domain, not
 * whatever host happened to run the code. Reminders are sent by a scheduled job
 * that calls the site by its *.vercel.app address, so deriving the origin from
 * the request put "drsmells-website.vercel.app/pay/356WSO" in front of real
 * customers.
 *
 * Deliberately a constant with the real domain as its default rather than an
 * environment variable alone: NEXT_PUBLIC_SITE_URL has never been set in
 * production, so every fallback behind it was the one actually in use.
 */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://drsmells.com.my")
  .trim()
  .replace(/\/+$/, "");

/** Where a customer goes to pay for an order that is still unpaid. */
export function paymentLink(orderNumber: string): string {
  return `${SITE_ORIGIN}/pay/${encodeURIComponent(orderNumber)}`;
}
