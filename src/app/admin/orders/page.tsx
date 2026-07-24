"use client";

import { useEffect, useState } from "react";
import { Order } from "@/lib/types";
import { Package, Eye, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      console.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  async function updateOrder(id: string, updates: { status?: string; payment_status?: string; notes?: string }) {
    const res = await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });

    if (res.ok) {
      loadOrders();
    } else {
      alert("Failed to update order");
    }
  }

  const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Loading orders...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} total orders</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending", "paid", "shipped", "completed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === s
                ? "bg-olive text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1.5 text-xs">
                ({orders.filter((o) => o.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <div key={order.id} className="bg-white rounded-xl border overflow-hidden">
                {/* Order header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-semibold text-gray-800 text-left">{order.order_number}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.created_at).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || "bg-gray-100"}`}>
                      {order.status}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[order.payment_status] || "bg-gray-100"}`}>
                      {order.payment_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-semibold text-gray-800">RM {Number(order.total).toFixed(2)}</p>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      {/* Order Items */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Items</h3>
                        <div className="space-y-2">
                          {(order.items || []).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                {item.product_name} ({item.variation}) × {item.quantity}
                              </span>
                              <span className="text-gray-800 font-medium">RM {Number(item.total_price).toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="border-t pt-2 mt-2">
                            <div className="flex justify-between text-sm text-gray-500">
                              <span>Subtotal</span>
                              <span>RM {Number(order.subtotal).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                              <span>Shipping</span>
                              <span>{Number(order.shipping_cost) === 0 ? "FREE" : `RM ${Number(order.shipping_cost).toFixed(2)}`}</span>
                            </div>
                            <div className="flex justify-between text-sm font-semibold text-gray-800 mt-1">
                              <span>Total</span>
                              <span>RM {Number(order.total).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Shipping Info */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Shipping</h3>
                        {order.shipping && (
                          <div className="text-sm text-gray-600 space-y-1">
                            <p className="font-medium text-gray-800">{order.shipping.name}</p>
                            <p>{order.shipping.email}</p>
                            <p>{order.shipping.phone}</p>
                            <p>{order.shipping.address_line1}</p>
                            {order.shipping.address_line2 && <p>{order.shipping.address_line2}</p>}
                            <p>{order.shipping.city}, {order.shipping.state} {order.shipping.postcode}</p>
                            <p>{order.shipping.country}</p>
                          </div>
                        )}

                        <div className="mt-4">
                          <p className="text-xs text-gray-500">Payment: {order.payment_method}</p>
                          {order.payment_reference && (
                            <p className="text-xs text-gray-500">Ref: {order.payment_reference}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex flex-wrap gap-3 items-center border-t pt-4">
                      <div>
                        <label className="text-xs text-gray-500 mr-2">Order Status:</label>
                        <select
                          value={order.status}
                          onChange={(e) => updateOrder(order.id, { status: e.target.value })}
                          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="shipped">Shipped</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mr-2">Payment:</label>
                        <select
                          value={order.payment_status}
                          onChange={(e) => updateOrder(order.id, { payment_status: e.target.value })}
                          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="failed">Failed</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
