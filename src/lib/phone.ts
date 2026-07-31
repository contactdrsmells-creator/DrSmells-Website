/**
 * Stores Malaysian phone numbers in international form.
 *
 * Customers type "0109776875" or "012-345 6789"; WhatsApp, Strive and the CRM
 * all expect "60109776875". Normalising once at order creation means every
 * downstream consumer gets a consistent value instead of each guessing.
 *
 * Mirrors the CRM's create-time rule deliberately, so an order looks the same
 * in both systems. Anything not recognisable as a local mobile is stored as
 * typed rather than mangled — an unusual number is better than a wrong one.
 */
export function normalisePhoneForStorage(raw: string | null | undefined): string {
  const original = String(raw ?? "").trim();
  const digits = original.replace(/\D/g, "");
  if (!digits) return original;

  if (digits.startsWith("60")) return digits;           // already international
  if (digits.startsWith("0")) return "60" + digits.slice(1);

  return original;                                       // unrecognised — leave alone
}
