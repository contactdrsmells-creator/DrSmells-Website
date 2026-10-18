"use client";

import { useEffect, useState } from "react";
import { X, Plus, Minus, Trash2, AlertTriangle } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { resolveUnitPrice } from "@/lib/pricing";
import { usePathname, useRouter } from "next/navigation";

interface Availability {
  limited: boolean;
  soldOut: boolean;
  remaining: number | null;
}

/**
 * Whether what is in the basket can still be bought.
 *
 * A cart lives in the shopper's own browser and knows nothing after the moment
 * it was filled. A limited package could sell out while it sat there, and the
 * first anyone heard of it was the checkout route refusing the order — after
 * the name, the address and the phone number had all been typed in. Some of
 * them will have simply left rather than go back and choose again.
 *
 * Asked when the drawer opens, which is the first moment the shopper looks at
 * the basket again. A failure answers nothing and changes nothing: checkout
 * verifies this properly, and a shop that cannot reach its own endpoint should
 * not start telling people their basket is empty.
 */
export default function Cart() {
  const router = useRouter();
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalPrice = useCartStore((s) => s.totalPrice());

  const [availability, setAvailability] = useState<Record<string, Record<string, Availability>>>({});

  // One request per product in the basket, which is almost always one.
  const slugs = [...new Set(items.map((i) => i.product.slug).filter(Boolean))].join(",");

  useEffect(() => {
    if (!slugs) return;
    let cancelled = false;

    Promise.all(
      slugs.split(",").map((slug) =>
        fetch(`/api/products/availability?slug=${encodeURIComponent(slug)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [slug, d?.availability || {}] as const)
          .catch(() => [slug, {}] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setAvailability(Object.fromEntries(pairs));
    });

    return () => { cancelled = true; };
  }, [slugs]);

  /** Why this line cannot be bought as it stands, or null when it can. */
  function problemWith(item: (typeof items)[number]): string | null {
    const left = availability[item.product.slug]?.[item.selectedSize];
    if (!left) return null;
    if (left.soldOut) return "Sold out — please remove this to continue";
    if (left.remaining !== null && item.quantity > left.remaining) {
      return `Only ${left.remaining} left — please reduce the quantity`;
    }
    return null;
  }

  const blocked = items.some((item) => problemWith(item) !== null);

  // Vouchers are applied on the checkout page only. Offering the field here
  // too meant the same code was entered and validated in two places, and the
  // cart's total then disagreed with the checkout page, which also has to
  // account for shipping.

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setCartOpen(false)}
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-olive/10">
          <h2 className="text-lg font-semibold text-olive">Shopping Cart</h2>
          <button onClick={() => setCartOpen(false)}>
            <X className="w-5 h-5 text-olive/50 hover:text-olive" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <p className="text-olive/50 text-center mt-10">
              Your cart is empty
            </p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const subKey = item.subscription ? `sub-${item.subscription.interval_months}` : "onetime";
                const problem = problemWith(item);
                return (
                <div
                  key={`${item.product.id}-${item.selectedSize}-${subKey}`}
                  className={`flex gap-4 p-3 rounded-lg ${problem ? "bg-red-50 border border-red-200" : "bg-sage-light"}`}
                >
                  <div className="w-16 h-16 bg-sage-bg rounded-md flex items-center justify-center text-olive text-xs font-medium flex-shrink-0">
                    {item.product.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover rounded-md"
                      />
                    ) : (
                      "IMG"
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-olive truncate">
                      {item.product.name}
                    </h3>
                    <p className="text-xs text-olive/50">
                      {item.selectedSize.includes(": ") ? item.selectedSize : `Size: ${item.selectedSize}`}
                    </p>
                    {item.subscription && (
                      <p className="text-xs text-olive/70 font-medium">
                        Every {item.subscription.interval_months} month{item.subscription.interval_months > 1 ? "s" : ""}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-olive mt-1">
                      RM{" "}
                      {(item.subscription
                        ? item.subscription.price * item.quantity
                        : resolveUnitPrice(item.product, item.selectedSize) * item.quantity
                      ).toFixed(2)}
                      {item.subscription && <span className="text-xs font-normal text-olive/50"> / month</span>}
                    </p>

                    {problem && (
                      <p className="flex items-start gap-1.5 text-xs text-red-700 font-medium mt-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>{problem}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.selectedSize, item.quantity - 1, subKey)
                        }
                        className="w-7 h-7 rounded border border-olive/20 flex items-center justify-center hover:bg-sage-bg text-olive"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm w-6 text-center text-olive">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.selectedSize, item.quantity + 1, subKey)
                        }
                        className="w-7 h-7 rounded border border-olive/20 flex items-center justify-center hover:bg-sage-bg text-olive"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeItem(item.product.id, item.selectedSize, subKey)}
                        className="ml-auto text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-olive/10 px-6 py-4">
            <div className="flex justify-between text-lg font-semibold mb-1 text-olive">
              <span>Subtotal</span>
              <span>RM {totalPrice.toFixed(2)}</span>
            </div>
            <p className="text-xs text-olive/50 mb-4">
              Shipping and voucher applied at checkout
            </p>
            {blocked && (
              <p className="flex items-start gap-1.5 text-xs text-red-700 font-medium mb-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Something in your cart is no longer available. Adjust it above to carry on.</span>
              </p>
            )}
            {/* Stopped here rather than at the end, because the order would be
                refused anyway and the shopper would have typed an address for
                nothing. */}
            <button
              onClick={() => {
                setCartOpen(false);
                router.push("/checkout");
              }}
              disabled={blocked}
              className="w-full py-3 bg-olive text-cream font-semibold rounded-lg hover:bg-sage-dark transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Proceed to Checkout
            </button>
            {/* Closing the drawer is enough when the shop is already behind
                it — pushing the same route would only scroll them back to the
                top of the list they were reading. */}
            <button
              onClick={() => {
                setCartOpen(false);
                if (pathname !== "/shop") router.push("/shop");
              }}
              className="w-full py-3 mt-2 border border-olive/20 text-olive font-semibold rounded-lg hover:bg-olive/5 transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
