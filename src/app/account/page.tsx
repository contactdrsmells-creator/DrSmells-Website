"use client";

import { useState } from "react";
import { Search, Loader2, Package } from "lucide-react";
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
