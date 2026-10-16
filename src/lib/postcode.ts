/**
 * Whether a postcode belongs to the country it was entered under.
 *
 * The checkout offers Malaysia and Singapore, and nothing stopped a Singapore
 * postcode being filed under Malaysia. A six-digit Singapore code went in as a
 * Malaysian address, the order was quoted West Malaysian postage, and the
 * mismatch only showed up when somebody came to book the parcel.
 *
 * Checked on shape and range, not against a directory of real streets: the aim
 * is to catch the country being wrong, which a length alone settles. Malaysia
 * writes five digits, Singapore six, so neither can be mistaken for the other.
 */

export interface PostcodeRule {
  digits: number;
  /** Inclusive range of the leading sector digits, where one applies. */
  ranges?: [number, number][];
}

const RULES: Record<string, PostcodeRule> = {
  // 01000–98859 in practice; the first two digits are the state, and 00 is
  // not one of them.
  Malaysia: { digits: 5, ranges: [[1000, 98859]] },
  // 01xxxx–82xxxx. The first two digits are the delivery sector, which runs
  // 01 to 82 with no sector 00.
  Singapore: { digits: 6, ranges: [[10000, 829999]] },
};

export type PostcodeCheck = { ok: true } | { ok: false; error: string };

/** Only the digits, so spaces and a stray dash do not fail a good postcode. */
export function cleanPostcode(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * Whether this postcode can belong to this country.
 *
 * A country the shop does not ship to is not this function's business, so it
 * passes — the country list is what restricts that, and failing here as well
 * would report the wrong reason.
 */
export function checkPostcode(
  postcode: string | null | undefined,
  country: string | null | undefined,
): PostcodeCheck {
  const rule = RULES[String(country ?? "").trim()];
  if (!rule) return { ok: true };

  const digits = cleanPostcode(postcode);
  if (!digits) return { ok: false, error: "Please enter your postcode" };

  if (digits.length !== rule.digits) {
    // Naming the other country is the whole point: somebody typing six digits
    // under Malaysia has picked the wrong country, not mistyped a digit, and
    // "invalid postcode" would send them hunting through the number instead.
    const other = Object.entries(RULES).find(
      ([name, r]) => name !== country && r.digits === digits.length,
    )?.[0];
    return {
      ok: false,
      error: other
        ? `That looks like a ${other} postcode. Change Country to ${other}, or check the postcode.`
        : `A ${country} postcode is ${rule.digits} digits. You entered ${digits.length}.`,
    };
  }

  const value = Number(digits);
  if (rule.ranges && !rule.ranges.some(([lo, hi]) => value >= lo && value <= hi)) {
    return { ok: false, error: `${digits} is not a ${country} postcode. Please check it.` };
  }

  return { ok: true };
}
