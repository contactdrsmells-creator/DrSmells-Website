"use client";

import { useState } from "react";
import { X, Plus, Minus, Trash2, Tag, Loader2 } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { useRouter } from "next/navigation";

export default function Cart() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalPrice = useCartStore((s) => s.totalPrice());

  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    free_shipping?: boolean;
  } | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState("");

  const hasSubscription = items.some((item) => item.subscription);

  const discount = appliedVoucher
    ? appliedVoucher.discount_type === "percentage"
      ? Math.min(totalPrice * (appliedVoucher.discount_value / 100), totalPrice)
      : Math.min(appliedVoucher.discount_value, totalPrice)
    : 0;

  async function applyVoucher() {
    if (!voucherCode.trim()) return;
    setVoucherLoading(true);
    setVoucherError("");
    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode.trim(), subtotal: totalPrice, has_subscription: hasSubscription }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedVoucher(data);
        setVoucherError("");
      } else {
        setVoucherError(data.error || "Invalid voucher code");
        setAppliedVoucher(null);
      }
    } catch {
      setVoucherError("Failed to validate voucher");
    } finally {
      setVoucherLoading(false);
    }
  }

  function removeVoucher() {
    setAppliedVoucher(null);
    setVoucherCode("");
    setVoucherError("");
  }

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
            {/* Voucher Input */}
            <div className="mb-4">
              {appliedVoucher ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{appliedVoucher.code}</span>
                    <span className="text-xs text-green-600">
                      ({appliedVoucher.discount_value > 0
                        ? appliedVoucher.discount_type === "percentage"
                          ? `${appliedVoucher.discount_value}% off`
                          : `RM${appliedVoucher.discount_value.toFixed(2)} off`
                        : ""}{appliedVoucher.free_shipping ? (appliedVoucher.discount_value > 0 ? " + Free shipping" : "Free shipping") : ""})
                    </span>
                  </div>
                  <button onClick={removeVoucher} className="text-green-500 hover:text-green-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Voucher code"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && applyVoucher()}
                      className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                    />
                    <button
                      onClick={applyVoucher}
                      disabled={voucherLoading || !voucherCode.trim()}
                      className="px-4 py-2 bg-olive text-white text-sm font-medium rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {voucherLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                    </button>
                  </div>
                  {voucherError && <p className="text-xs text-red-500 mt-1">{voucherError}</p>}
                </div>
              )}
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-sm mb-1 text-olive/70">
                <span>Subtotal</span>
                <span>RM {totalPrice.toFixed(2)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-sm mb-1 text-green-600">
                <span>Discount</span>
                <span>-RM {discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold mb-4 text-olive">
              <span>Total</span>
              <span>RM {(totalPrice - discount).toFixed(2)}</span>
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
