/**
 * Stores Malaysian phone numbers in international form.
 *
 * Customers type "0109776875" or "012-345 6789"; WhatsApp, Strive and the CRM
 * all expect "60109776875". Normalising once at order creation means every
 * downstream consumer gets a consistent value instead of each guessing.
 *
 * The 60 prefix is only ever applied to Malaysian orders. A leading 0 is a
 * national-format prefix in most countries — an Indonesian "08123456789" would
 * otherwise become "608123456789", a number that doesn't exist. Overseas
 * numbers are stored exactly as the customer typed them.
 *
 * Mirrors the CRM's create-time rule so an order looks the same in both systems.
 */

function isMalaysia(country: string | null | undefined): boolean {
  const value = String(country ?? "").trim().toLowerCase();
  // Empty means the field wasn't collected; the storefront is Malaysian, so
  // treat that as local rather than refusing to normalise anything.
  return value === "" || value === "malaysia" || value === "my" || value === "mys";
}

export function normalisePhoneForStorage(
  raw: string | null | undefined,
  country?: string | null,
): string {
  const original = String(raw ?? "").trim();
  const digits = original.replace(/\D/g, "");
  if (!digits) return original;

  // An explicit "+" means the customer already gave a country code — take it as
  // written, whatever country that is.
  if (original.startsWith("+")) return digits;

  if (!isMalaysia(country)) return original;

  if (digits.startsWith("60")) return digits;           // already international
  if (digits.startsWith("0")) return "60" + digits.slice(1);

  return original;                                       // unrecognised — leave alone
}
