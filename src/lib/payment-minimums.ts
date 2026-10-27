/**
 * The smallest order each gateway will take, in ringgit.
 *
 * Every gateway has a floor, and none of them was being checked except Atome's
 * — so a RM1 order was accepted by the shop, written to the database, and then
 * refused by the gateway. The customer was handed a page saying "Order
 * Received. We're waiting for payment confirmation" about a payment they had
 * never been given the chance to make, and the order sat pending forever.
 *
 * Checked before the order is created, so a basket that cannot be paid for is
 * turned away while the shopper can still do something about it.
 *
 * DOKU publishes MYR 2 for cards, FPX and the e-wallets; Stripe's own minimum
 * charge in ringgit is the same. Atome's is RM10, which is the one that bites
 * in practice — it is an instalment plan, not a payment method for small
 * baskets.
 *
 * Deliberately free of imports. The checkout page shows these numbers on the
 * payment options, and anything this file pulled in would be bundled into the
 * browser along with it — which is no place for the gateway modules, since
 * they read the API keys.
 */
export const DOKU_MIN_TOTAL_MYR = 2;
export const STRIPE_MIN_TOTAL_MYR = 2;
export const ATOME_MIN_TOTAL_MYR = 10;

const MINIMUMS: Record<string, number> = {
  doku: DOKU_MIN_TOTAL_MYR,
  stripe: STRIPE_MIN_TOTAL_MYR,
  atome: ATOME_MIN_TOTAL_MYR,
};

const LABELS: Record<string, string> = {
  doku: "DOKU",
  stripe: "Card payment",
  atome: "Atome",
};

export function minimumFor(method: string): number {
  return MINIMUMS[method] ?? 0;
}

/**
 * Null when the order may proceed, otherwise the sentence to show the shopper.
 *
 * The message names the amount rather than just refusing, because the shopper
 * can act on a number: adding one more item is the difference between a lost
 * basket and a sale.
 */
export function checkMinimum(method: string, total: number): string | null {
  const minimum = minimumFor(method);
  if (!minimum || total >= minimum) return null;

  const label = LABELS[method] ?? "This payment method";
  return `${label} needs an order of at least RM${minimum.toFixed(2)}. Your total is RM${total.toFixed(2)}.`;
}
