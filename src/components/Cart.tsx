"use client";

import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { useRouter } from "next/navigation";

export default function Cart() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalPrice = useCartStore((s) => s.totalPrice());

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
                return (
                <div
                  key={`${item.product.id}-${item.selectedSize}-${subKey}`}
                  className="flex gap-4 p-3 bg-sage-light rounded-lg"
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
                      {(() => {
                        if (item.subscription) return (item.subscription.price * item.quantity).toFixed(2);
                        const combos = item.product.variation_combos || [];
                        if (combos.length > 0 && item.selectedSize.includes(": ")) {
                          const selections: Record<string, string> = {};
                          item.selectedSize.split(" | ").forEach(part => {
                            const [k, v] = part.split(": ");
                            if (k && v) selections[k] = v;
                          });
                          const combo = combos.find(c =>
                            Object.keys(selections).every(k => c.selections[k] === selections[k])
                          );
                          if (combo) return ((combo.sale_price ?? combo.price) * item.quantity).toFixed(2);
                        }
                        const v = (item.product.variations || []).find((v) => v.name === item.selectedSize);
                        const p = v ? (v.sale_price ?? v.price) : (item.product.sale_price ?? item.product.price);
                        return (p * item.quantity).toFixed(2);
                      })()}
                      {item.subscription && <span className="text-xs font-normal text-olive/50"> / month</span>}
                    </p>

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
            <div className="flex justify-between text-lg font-semibold mb-4 text-olive">
              <span>Total</span>
              <span>RM {totalPrice.toFixed(2)}</span>
            </div>
            <button
              onClick={() => {
                setCartOpen(false);
                router.push("/checkout");
              }}
              className="w-full py-3 bg-olive text-cream font-semibold rounded-lg hover:bg-sage-dark transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
