/**
 * Shipping rates, in one place because two sides have to agree on them: the
 * checkout page quotes a figure to the customer, and the order route works the
 * same figure out again from the database before taking any money. When those
 * two disagreed in the past it was always the customer who noticed first.
 */

export interface ShippingZone {
  id: string;
  name: string;
  states: string[];
  flat_rate: number;
  free_shipping_min: number;
}

/**
 * A product's own rates, one per zone id, overriding the shop's table.
 *
 * A campaign product is quoted its own price to ship — "free to West Malaysia,
 * RM5 to East" — and that promise has to hold whatever the rest of the shop
 * charges. An absent zone means that zone is not special for this product and
 * falls back to the normal table.
 */
export type ProductShippingRates = Record<string, number>;

export function findZone(zones: ShippingZone[], state: string): ShippingZone | undefined {
  return zones.find((z) => z.states.includes(state));
}

/** What the shop charges for this zone before any product has its say. */
function standardRate(zone: ShippingZone, subtotal: number): number {
  const qualifiesForFree = zone.free_shipping_min > 0 && subtotal >= zone.free_shipping_min;
  return qualifiesForFree ? 0 : zone.flat_rate;
}

export interface ShippingQuote {
  cost: number;
  /** The product whose rate set the price, for explaining the figure. */
  specialProduct: string | null;
}

/**
 * Works out one shipping charge for a whole order.
 *
 * A product with a special rate sets the price for everything in the basket:
 * the customer was promised that rate, and anything else they add rides along
 * rather than quietly withdrawing the offer at the last screen. Two special
 * products in one basket take the dearer of the two, so adding a second one
 * can never cost less than buying it on its own.
 *
 * A special rate also ignores the free-shipping threshold. RM5 to East
 * Malaysia is meant to be RM5, not free the moment the order passes RM50 —
 * that threshold is a shop-wide offer, and a product priced its own way has
 * opted out of it.
 */
export function quoteShipping(
  cart: { name: string; rates?: ProductShippingRates | null }[],
  zone: ShippingZone | undefined,
  subtotal: number,
): ShippingQuote {
  if (!zone) return { cost: 0, specialProduct: null };

  let dearest: { cost: number; specialProduct: string } | null = null;
  for (const line of cart) {
    const rate = line.rates?.[zone.id];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) continue;
    if (!dearest || rate > dearest.cost) dearest = { cost: rate, specialProduct: line.name };
  }

  return dearest || { cost: standardRate(zone, subtotal), specialProduct: null };
}

/**
 * Reads rates off a product row, tolerating a column that is not there yet and
 * the empty objects left behind by unticking every zone.
 */
export function readShippingRates(row: unknown): ProductShippingRates | null {
  const raw = (row as { shipping_rates?: unknown } | null)?.shipping_rates;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const rates: ProductShippingRates = {};
  for (const [zoneId, value] of Object.entries(raw as Record<string, unknown>)) {
    const rate = typeof value === "string" ? parseFloat(value) : value;
    if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) rates[zoneId] = rate;
  }
  return Object.keys(rates).length > 0 ? rates : null;
}
