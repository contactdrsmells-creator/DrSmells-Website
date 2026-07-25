"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cart-store";
import { ShippingAddress } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka",
  "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
  "Sabah", "Sarawak", "Selangor", "Terengganu",
];

interface PaymentSettings {
  senangpay_enabled: boolean;
  stripe_enabled: boolean;
  doku_enabled: boolean;
  shipping_cost: string;
  free_shipping_threshold: string;
  currency: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const totalPrice = useCartStore((s) => s.totalPrice());
  const clearCart = useCartStore((s) => s.clearCart);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"senangpay" | "stripe" | "doku">("senangpay");

  const [shipping, setShipping] = useState<ShippingAddress>({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postcode: "",
    country: "Malaysia",
  });

  useEffect(() => {
    fetch("/api/payment-settings")
      .then((r) => r.json())
      .then((data) => {
        setPaymentSettings(data);
        if (data.doku_enabled) setPaymentMethod("doku");
        else if (data.senangpay_enabled) setPaymentMethod("senangpay");
        else if (data.stripe_enabled) setPaymentMethod("stripe");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (items.length === 0 && !submitting) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold text-olive mb-4">Your cart is empty</h1>
        <Link href="/shop" className="text-olive underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  const shippingCost = paymentSettings
    ? totalPrice >= parseFloat(paymentSettings.free_shipping_threshold)
      ? 0
      : parseFloat(paymentSettings.shipping_cost)
    : 0;
  const orderTotal = totalPrice + shippingCost;

  function updateField(field: keyof ShippingAddress, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Validate
    const required: (keyof ShippingAddress)[] = ["name", "email", "phone", "address_line1", "city", "state", "postcode"];
    for (const field of required) {
      if (!shipping[field]?.trim()) {
        alert(`Please fill in ${field.replace(/_/g, " ")}`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const orderItems = items.map((item) => {
        const variation = (item.product.variations || []).find((v) => v.name === item.selectedSize);
        const unitPrice = variation
          ? (variation.sale_price ?? variation.price)
          : (item.product.sale_price ?? item.product.price);
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          variation: item.selectedSize,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: unitPrice * item.quantity,
          image_url: item.product.image_url || undefined,
        };
      });

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderItems,
          shipping,
          payment_method: paymentMethod,
          subtotal: totalPrice,
          shipping_cost: shippingCost,
          total: orderTotal,
          source: (() => {
            const params = new URLSearchParams(window.location.search);
            return params.get("utm_source") || params.get("ref") || "Direct";
          })(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to create order");
        setSubmitting(false);
        return;
      }

      // Clear cart before redirect
      clearCart();

      if (data.redirect_url) {
        // Redirect to payment gateway
        window.location.href = data.redirect_url;
      } else {
        // Manual / fallback — go to confirmation
        router.push(`/order-confirmation?order=${data.order_number}`);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-olive" />
      </div>
    );
  }

  const noPaymentEnabled = !!paymentSettings && !paymentSettings.senangpay_enabled && !paymentSettings.stripe_enabled && !paymentSettings.doku_enabled;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/shop" className="inline-flex items-center gap-2 text-olive/60 hover:text-olive mb-6">
          <ArrowLeft className="w-4 h-4" />
          Continue Shopping
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-olive mb-8">Checkout</h1>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left - Shipping Details */}
            <div>
              <h2 className="text-lg font-semibold text-olive mb-4">Shipping Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-olive/70 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={shipping.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-olive/70 mb-1">Email *</label>
                    <input
                      type="email"
                      value={shipping.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-olive/70 mb-1">Phone *</label>
                    <input
                      type="tel"
                      value={shipping.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-olive/70 mb-1">Address Line 1 *</label>
                  <input
                    type="text"
                    value={shipping.address_line1}
                    onChange={(e) => updateField("address_line1", e.target.value)}
                    className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-olive/70 mb-1">Address Line 2</label>
                  <input
                    type="text"
                    value={shipping.address_line2}
                    onChange={(e) => updateField("address_line2", e.target.value)}
                    className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-olive/70 mb-1">City *</label>
                    <input
                      type="text"
                      value={shipping.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-olive/70 mb-1">Postcode *</label>
                    <input
                      type="text"
                      value={shipping.postcode}
                      onChange={(e) => updateField("postcode", e.target.value)}
                      className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-olive/70 mb-1">State *</label>
                  <select
                    value={shipping.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    className="w-full px-4 py-2.5 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive bg-white"
                    required
                  >
                    <option value="">Select state</option>
                    {MALAYSIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              {!noPaymentEnabled && (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-olive mb-4">Payment Method</h2>
                  <div className="space-y-3">
                    {paymentSettings?.senangpay_enabled && (
                      <label className="flex items-center gap-3 p-4 border border-olive/20 rounded-lg cursor-pointer hover:border-olive/40 transition-colors">
                        <input
                          type="radio"
                          name="payment"
                          value="senangpay"
                          checked={paymentMethod === "senangpay"}
                          onChange={() => setPaymentMethod("senangpay")}
                          className="accent-olive"
                        />
                        <div>
                          <p className="font-medium text-olive">SenangPay</p>
                          <p className="text-xs text-olive/50">Online Banking, Credit/Debit Card (Malaysia)</p>
                        </div>
                      </label>
                    )}
                    {paymentSettings?.stripe_enabled && (
                      <label className="flex items-center gap-3 p-4 border border-olive/20 rounded-lg cursor-pointer hover:border-olive/40 transition-colors">
                        <input
                          type="radio"
                          name="payment"
                          value="stripe"
                          checked={paymentMethod === "stripe"}
                          onChange={() => setPaymentMethod("stripe")}
                          className="accent-olive"
                        />
                        <div>
                          <p className="font-medium text-olive">Stripe</p>
                          <p className="text-xs text-olive/50">Credit/Debit Card (International)</p>
                        </div>
                      </label>
                    )}
                    {paymentSettings?.doku_enabled && (
                      <label className="flex items-center gap-3 p-4 border border-olive/20 rounded-lg cursor-pointer hover:border-olive/40 transition-colors">
                        <input
                          type="radio"
                          name="payment"
                          value="doku"
                          checked={paymentMethod === "doku"}
                          onChange={() => setPaymentMethod("doku")}
                          className="accent-olive"
                        />
                        <div>
                          <p className="font-medium text-olive">DOKU</p>
                          <p className="text-xs text-olive/50">FPX, E-Wallet, BNPL, Credit/Debit Card (Malaysia)</p>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right - Order Summary */}
            <div>
              <div className="bg-gray-50 rounded-xl p-6 sticky top-24">
                <h2 className="text-lg font-semibold text-olive mb-4">Order Summary</h2>
                <div className="space-y-3 mb-6">
                  {items.map((item) => {
                    const variation = (item.product.variations || []).find((v) => v.name === item.selectedSize);
                    const unitPrice = variation
                      ? (variation.sale_price ?? variation.price)
                      : (item.product.sale_price ?? item.product.price);
                    return (
                      <div key={`${item.product.id}-${item.selectedSize}`} className="flex gap-3">
                        <div className="w-14 h-14 bg-white rounded-md flex-shrink-0 overflow-hidden">
                          {item.product.image_url ? (
                            <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-olive/30 text-xs">IMG</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-olive truncate">{item.product.name}</p>
                          <p className="text-xs text-olive/50">{item.selectedSize} × {item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium text-olive">RM {(unitPrice * item.quantity).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-olive/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-olive/70">
                    <span>Subtotal</span>
                    <span>RM {totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-olive/70">
                    <span>Shipping</span>
                    <span>{shippingCost === 0 ? "FREE" : `RM ${shippingCost.toFixed(2)}`}</span>
                  </div>
                  {shippingCost === 0 && paymentSettings && parseFloat(paymentSettings.free_shipping_threshold) > 0 && (
                    <p className="text-xs text-green-600">Free shipping on orders above RM {paymentSettings.free_shipping_threshold}</p>
                  )}
                  <div className="flex justify-between text-lg font-bold text-olive pt-2 border-t border-olive/10">
                    <span>Total</span>
                    <span>RM {orderTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || noPaymentEnabled}
                  className="w-full mt-6 py-3 bg-olive text-cream font-semibold rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : noPaymentEnabled ? (
                    "Payment not configured"
                  ) : (
                    `Pay RM ${orderTotal.toFixed(2)}`
                  )}
                </button>

                {noPaymentEnabled && (
                  <p className="text-xs text-red-500 text-center mt-2">
                    Payment gateways not enabled. Please contact the store owner.
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
