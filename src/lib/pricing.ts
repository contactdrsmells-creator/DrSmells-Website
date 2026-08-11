/**
 * Single source of truth for resolving a cart line's unit price.
 *
 * Products price in one of three ways, in priority order:
 *   1. variation_combos — multi-attribute (bundles), keyed by a selections map
 *   2. variations       — single-attribute, keyed by name
 *   3. the product's own price/sale_price
 *
 * This lived separately in the cart store, the cart drawer, the checkout page
 * and the checkout API, and only some of them handled combos — so bundles
 * priced correctly in the cart and then failed server verification with
 * "Price mismatch". Everything must resolve prices through here.
 */

export interface PriceableVariation {
  name: string;
  price: number;
  sale_price?: number | null;
  subscription_price?: number | null;
}

export interface PriceableCombo {
  selections: Record<string, string>;
  price: number;
  sale_price?: number | null;
  subscription_price?: number | null;
}

export interface PriceableProduct {
  price: number;
  sale_price?: number | null;
  variations?: PriceableVariation[] | null;
  variation_combos?: PriceableCombo[] | null;
}

/**
 * Cart lines store a combo selection as "Attr A: Val | Attr B: Val".
 * Returns null when the label isn't a combo selection.
 */
export function parseComboSelections(selectedSize: string): Record<string, string> | null {
  if (!selectedSize || !selectedSize.includes(": ")) return null;

  const selections: Record<string, string> = {};
  for (const part of selectedSize.split(" | ")) {
    const sep = part.indexOf(": ");
    if (sep > 0) {
      // Split on the first ": " only — attribute values may contain one too.
      selections[part.slice(0, sep).trim()] = part.slice(sep + 2).trim();
    }
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

/** Resolves the unit price for a selection, mirroring how the cart displays it. */
export function resolveUnitPrice(product: PriceableProduct, selectedSize: string): number {
  const combos = product.variation_combos || [];
  const selections = parseComboSelections(selectedSize);

  if (combos.length > 0 && selections) {
    const combo = combos.find((c) =>
      Object.keys(selections).every((key) => c.selections?.[key] === selections[key]),
    );
    if (combo) return combo.sale_price ?? combo.price;
  }

  const variation = (product.variations || []).find((v) => v.name === selectedSize);
  if (variation) return variation.sale_price ?? variation.price;

  return product.sale_price ?? product.price;
}

/**
 * True when a product prices through combinations but the selection matches
 * none of them.
 *
 * resolveUnitPrice falls back to the base price in that case, which is right
 * for a product that simply has no variations and wrong for one that does. The
 * Underarm & Breath Freshening Set was offered as Mouthspray × Anti odour
 * cream while its combination prices were still keyed on "Travel packs" from
 * the product it had been copied from, so nothing could ever match: a RM89
 * bundle sold for the RM49.90 base price, twice over, and the server agreed
 * because it resolves prices through the very same function.
 *
 * A price that cannot be determined has to stop the order. Charging the base
 * price is a silent loss that only surfaces by reading order lines by eye.
 */
export function hasUnmatchedCombo(product: PriceableProduct, selectedSize: string): boolean {
  const combos = product.variation_combos || [];
  if (!combos.length) return false;

  // Not a combination selection at all — a plain variation name or no choice —
  // so the ordinary fallbacks apply.
  const selections = parseComboSelections(selectedSize);
  if (!selections) return false;

  return !combos.some((c) =>
    Object.keys(selections).every((key) => c.selections?.[key] === selections[key]),
  );
}

/**
 * Subscription price for a selection, or null if that selection has none.
 *
 * Server-side verification must resolve this from the product rather than
 * trusting the price the client submitted, otherwise a crafted request could
 * set its own recurring price.
 */
export function resolveSubscriptionPrice(
  product: PriceableProduct,
  selectedSize: string,
): number | null {
  const combos = product.variation_combos || [];
  const selections = parseComboSelections(selectedSize);

  if (combos.length > 0 && selections) {
    const combo = combos.find((c) =>
      Object.keys(selections).every((key) => c.selections?.[key] === selections[key]),
    );
    if (combo) return combo.subscription_price ?? null;
  }

  const variation = (product.variations || []).find((v) => v.name === selectedSize);
  return variation?.subscription_price ?? null;
}
