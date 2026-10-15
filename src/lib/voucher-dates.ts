/**
 * When a voucher's dates mean what the shop meant.
 *
 * The admin form offers two date boxes, and somebody filling in 15 to 18
 * October means those four days as lived in Malaysia. Two things were quietly
 * getting in the way of that.
 *
 * The dates are stored as midnight UTC, and Malaysia is eight hours ahead — so
 * a voucher set to start on the 15th only woke up at 8am on the 15th, and one
 * set to end on the 18th died at 8am on the 18th rather than at the end of it.
 * A promotion announced for a day would be dead for most of it.
 *
 * And the end date was treated as a deadline rather than a last day. Nobody
 * writing "ends 18 October" means "stops working as the 18th begins".
 *
 * So the comparison is made between calendar days in Malaysia rather than
 * between instants. The stored value keeps its shape, which means none of the
 * vouchers already in the database need changing.
 */

const MY_TIMEZONE = "Asia/Kuala_Lumpur";

/** Today in Malaysia, as YYYY-MM-DD. en-CA is the locale that formats that way. */
export function todayInMalaysia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The calendar day a stored voucher date stands for.
 *
 * Read from the front of the stored value rather than by parsing it into an
 * instant, because parsing is exactly what shifts the day by a timezone.
 */
export function voucherDay(value: string | null | undefined): string | null {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** A day as somebody in Malaysia would write it. */
export function readableDay(value: string | null | undefined): string {
  const day = voucherDay(value);
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-MY", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type VoucherWindow =
  | { ok: true }
  | { ok: false; reason: "not_started" | "expired"; day: string; error: string };

/**
 * Whether today is inside a voucher's dates.
 *
 * Both ends are inclusive: a voucher running the 15th to the 18th works for
 * the whole of both days.
 */
export function voucherWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date = new Date(),
): VoucherWindow {
  const today = todayInMalaysia(now);

  const from = voucherDay(start);
  if (from && today < from) {
    return {
      ok: false,
      reason: "not_started",
      day: from,
      // Saying when turns "why not?" into an answer. The message was silent on
      // the one fact that explains it.
      error: `This voucher starts on ${readableDay(start)}`,
    };
  }

  const until = voucherDay(end);
  if (until && today > until) {
    return {
      ok: false,
      reason: "expired",
      day: until,
      // Just that it has ended. The date it ended on is our record-keeping,
      // not something the customer standing at checkout can act on.
      error: "This voucher is expired",
    };
  }

  return { ok: true };
}
