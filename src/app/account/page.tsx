"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Package, Gift } from "lucide-react";
import Link from "next/link";

export default function AccountPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<{
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    created_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * The signed-in half of this page. It stays null for a guest, who still gets
   * the order tracker below — looking up one order should never require an
   * account.
   */
  const [me, setMe] = useState<{
    customer: { name: string | null; phone: string };
    balance: number;
    value: number;
    history: { delta: number; reason: string; order_number: string | null; created_at: string }[];
    rules: { min_redeem: number; points_per_ringgit: number };
  } | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customer/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.customer ? d : null))
      .catch(() => {})
      .finally(() => setMeLoading(false));
  }, []);

  /**
   * Opened straight away when a customer arrives from the WhatsApp code, which
   * is the one moment they are certain to be here to set a password.
   */
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("set-password")) {
      setShowPassword(true);
    }
  }, []);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    const res = await fetch("/api/customer/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPasswordMsg("Password saved. You can use it next time you log in.");
      setNewPassword("");
    } else {
      setPasswordMsg(data.error || "Could not save the password");
    }
  }

  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    setMe(null);
  }

  const reasonLabel: Record<string, string> = {
    order: "Earned from order",
    signup: "Welcome bonus",
    redeemed: "Redeemed at checkout",
    reversed: "Order cancelled",
    manual: "Adjusted by Dr.Smells",
  };

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim()) return;

    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const res = await fetch(`/api/orders?order_number=${orderNumber.trim()}`);
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);
      } else {
        setError("Order not found. Please check your order number.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-4 py-16">
        {!meLoading && !me && (
          <div className="mb-8 rounded-xl border border-olive/15 p-5 text-center">
            <Gift className="w-8 h-8 text-olive mx-auto mb-2" />
            <p className="text-sm text-olive/70 mb-3">
              Log in to collect points on everything you buy.
            </p>
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 bg-olive text-cream rounded-lg text-sm font-semibold hover:bg-sage-dark transition-colors"
            >
              Log in or create an account
            </Link>
          </div>
        )}

        {me && (
          <div className="mb-10">
            <div className="rounded-xl bg-olive text-cream p-6 mb-4">
              <p className="text-xs uppercase tracking-wide opacity-70">
                {me.customer.name || me.customer.phone}
              </p>
              <p className="text-4xl font-bold mt-1">{me.balance.toLocaleString()}</p>
              <p className="text-sm opacity-80">
                points · worth RM {me.value.toFixed(2)} off your next order
              </p>
              {me.balance < me.rules.min_redeem && (
                <p className="text-xs opacity-70 mt-2">
                  {me.rules.min_redeem - me.balance} more points to start redeeming
                </p>
              )}
            </div>

            {me.history.length > 0 && (
              <div className="rounded-xl border border-olive/15 divide-y divide-olive/10">
                {me.history.map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-olive">{reasonLabel[row.reason] || row.reason}</p>
                      <p className="text-xs text-olive/40">
                        {new Date(row.created_at).toLocaleDateString()}
                        {row.order_number ? ` · ${row.order_number}` : ""}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${row.delta > 0 ? "text-green-600" : "text-olive/60"}`}>
                      {row.delta > 0 ? "+" : ""}{row.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {showPassword ? (
              <form onSubmit={savePassword} className="mt-4 rounded-xl border border-olive/15 p-4">
                <label className="block text-xs font-medium text-olive/70 mb-1">
                  Set a new password
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                    placeholder="At least 6 characters"
                    className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-olive"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-olive text-cream rounded-lg text-sm font-semibold hover:bg-sage-dark"
                  >
                    Save
                  </button>
                </div>
                {passwordMsg && <p className="text-xs text-olive/70 mt-2">{passwordMsg}</p>}
              </form>
            ) : (
              <button
                onClick={() => setShowPassword(true)}
                className="mt-4 mr-4 text-sm text-olive/50 hover:text-olive underline"
              >
                Change password
              </button>
            )}

            <button onClick={logout} className="mt-4 text-sm text-olive/50 hover:text-olive underline">
              Log out
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <Package className="w-12 h-12 text-olive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-olive mb-2">Track Your Order</h1>
          <p className="text-olive/60">Enter your order number to check your order status</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Enter order number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
          />
          <button
            type="submit"
            disabled={loading || !orderNumber.trim()}
            className="px-6 py-3 bg-olive text-cream rounded-lg font-semibold hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Track
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {order && (
          <div className="bg-gray-50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-olive mb-4">Order Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Order Number</span>
                <span className="text-sm font-semibold text-olive">{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Status</span>
                <span className={`text-sm font-semibold ${
                  order.payment_status === "paid" ? "text-green-600" :
                  order.payment_status === "failed" ? "text-red-600" :
                  "text-yellow-600"
                }`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Total</span>
                <span className="text-sm font-semibold text-olive">RM {Number(order.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Date</span>
                <span className="text-sm text-olive">{new Date(order.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <Link href="/shop" className="text-sm text-olive/60 hover:text-olive underline">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
