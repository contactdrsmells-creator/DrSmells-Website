"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cart-store";
import { ShippingAddress } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft, Loader2, X, Tag } from "lucide-react";

const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka",
  "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
  "Sabah", "Sarawak", "Selangor", "Terengganu",
];

interface PaymentSettings {
  doku_enabled: boolean;
}

interface ShippingZone {
  id: string;
  name: string;
  states: string[];
  flat_rate: number;
  free_shipping_min: number;
}

interface VoucherResult {
  valid: boolean;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  free_shipping?: boolean;
  error?: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const totalPrice = useCartStore((s) => s.totalPrice());
  const clearCart = useCartStore((s) => s.clearCart);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [shippingZones, setShippingZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"doku">("doku");

  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherResult | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState("");

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
    Promise.all([
      fetch("/api/payment-settings").then((r) => r.json()),
      fetch("/api/shipping-settings").then((r) => r.json()),
    ])
      .then(([payData, shipData]) => {
        setPaymentSettings(payData);
        setShippingZones(shipData.zones || []);
        if (payData.doku_enabled) setPaymentMethod("doku");
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

  const matchedZone = shippingZones.find((z) => z.states.includes(shipping.state));
  const shippingCost = appliedVoucher?.free_shipping
    ? 0
    : matchedZone
      ? (matchedZone.free_shipping_min > 0 && totalPrice >= matchedZone.free_shipping_min ? 0 : matchedZone.flat_rate)
      : 0;

  const discount = appliedVoucher
    ? appliedVoucher.discount_type === "percentage"
      ? Math.min(totalPrice * (appliedVoucher.discount_value / 100), totalPrice)
      : Math.min(appliedVoucher.discount_value, totalPrice)
    : 0;

  const orderTotal = Math.max(0, totalPrice - discount) + shippingCost;

  function updateField(field: keyof ShippingAddress, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
  }

  async function applyVoucher() {
    if (!voucherCode.trim()) return;
    setVoucherLoading(true);
    setVoucherError("");
    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode.trim(), subtotal: totalPrice, has_subscription: items.some((i) => i.subscription) }),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

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
        let unitPrice: number;
        if (item.subscription) {
          unitPrice = item.subscription.price;
        } else {
          const variation = (item.product.variations || []).find((v) => v.name === item.selectedSize);
          unitPrice = variation
            ? (variation.sale_price ?? variation.price)
            : (item.product.sale_price ?? item.product.price);
        }
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          variation: item.selectedSize,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: unitPrice * item.quantity,
          image_url: item.product.image_url || undefined,
          subscription: item.subscription || undefined,
        };
      });

      const hasSubscription = items.some((item) => item.subscription);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderItems,
          shipping,
          payment_method: hasSubscription ? "stripe" : paymentMethod,
          subtotal: totalPrice,
          shipping_cost: shippingCost,
          discount,
          voucher_code: appliedVoucher?.code || null,
          total: orderTotal,
          has_subscription: hasSubscription,
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

      clearCart();

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
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

  const hasSubscription = items.some((item) => item.subscription);
  const noPaymentEnabled = !!paymentSettings && !paymentSettings.doku_enabled && !hasSubscription;

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
                  {shipping.state && matchedZone && (
                    <p className="text-xs text-olive/50 mt-1">
                      Shipping zone: {matchedZone.name}
                      {matchedZone.free_shipping_min > 0 && ` (Free shipping above RM${matchedZone.free_shipping_min.toFixed(2)})`}
                    </p>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              {hasSubscription ? (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-olive mb-4">Payment Method</h2>
                  <div className="p-4 border border-olive/20 rounded-lg bg-olive/5">
                    <p className="font-medium text-olive">Stripe (Credit/Debit Card)</p>
                    <p className="text-xs text-olive/50 mt-1">Subscription orders are processed securely via Stripe</p>
                  </div>
                </div>
              ) : !noPaymentEnabled && (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-olive mb-4">Payment Method</h2>
                  <div className="space-y-3">
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
                    const unitPrice = item.subscription
                      ? item.subscription.price
                      : variation
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
                          <p className="text-xs text-olive/50">{item.selectedSize} x {item.quantity}</p>
                          {item.subscription && (
                            <p className="text-xs text-olive/60">Every {item.subscription.interval_months} month{item.subscription.interval_months > 1 ? "s" : ""}</p>
                          )}
                        </div>
                        <p className="text-sm font-medium text-olive">RM {(unitPrice * item.quantity).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Voucher Code */}
                <div className="border-t border-olive/10 pt-4 mb-4">
                  {appliedVoucher ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700">{appliedVoucher.code}</span>
                        <span className="text-xs text-green-600">
                          ({appliedVoucher.discount_type === "percentage"
                            ? `${appliedVoucher.discount_value}% off`
                            : `RM${appliedVoucher.discount_value.toFixed(2)} off`})
                        </span>
                      </div>
                      <button type="button" onClick={removeVoucher} className="text-green-500 hover:text-green-700">
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
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyVoucher())}
                          className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                        />
                        <button
                          type="button"
                          onClick={applyVoucher}
                          disabled={voucherLoading || !voucherCode.trim()}
                          className="px-4 py-2 bg-olive text-white text-sm font-medium rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50"
                        >
                          {voucherLoading ? "..." : "Apply"}
                        </button>
                      </div>
                      {voucherError && <p className="text-xs text-red-500 mt-1">{voucherError}</p>}
                    </div>
                  )}
                </div>

                <div className="border-t border-olive/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-olive/70">
                    <span>Subtotal</span>
                    <span>RM {totalPrice.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-RM {discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-olive/70">
                    <span>Shipping{shipping.state && matchedZone ? ` (${matchedZone.name})` : ""}</span>
                    <span>{!shipping.state ? "Select state" : shippingCost === 0 ? "FREE" : `RM ${shippingCost.toFixed(2)}`}</span>
                  </div>
                  {shippingCost === 0 && shipping.state && appliedVoucher?.free_shipping && (
                    <p className="text-xs text-green-600">Free shipping applied via voucher</p>
                  )}
                  {shippingCost === 0 && shipping.state && matchedZone && matchedZone.free_shipping_min > 0 && !appliedVoucher?.free_shipping && (
                    <p className="text-xs text-green-600">Free shipping on orders above RM {matchedZone.free_shipping_min.toFixed(2)}</p>
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
