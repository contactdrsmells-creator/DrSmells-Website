"use client";

import { useEffect, useState } from "react";
import { Order } from "@/lib/types";
import { Package, Eye, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null);

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

  async function createTestOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const body = {
      customer_name: formData.get("customer_name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      product_name: formData.get("product_name"),
      variation: formData.get("variation") || "Default",
      quantity: parseInt(formData.get("quantity") as string) || 1,
      unit_price: parseFloat(formData.get("unit_price") as string) || 0,
      address_line1: formData.get("address_line1"),
      city: formData.get("city"),
      state: formData.get("state"),
      postcode: formData.get("postcode"),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        setCreateResult({ success: true, message: `Order ${data.order_number} created and synced to CRM!` });
        form.reset();
        loadOrders();
      } else {
        setCreateResult({ success: false, message: data.error || "Failed to create order" });
      }
    } catch {
      setCreateResult({ success: false, message: "Network error" });
    } finally {
      setCreating(false);
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
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setCreateResult(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-olive text-white rounded-lg hover:bg-olive/90 transition-colors text-sm"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreateForm ? "Cancel" : "Create Test Order"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Create Test Order</h2>
          <p className="text-xs text-gray-500 mb-4">This creates a paid order and syncs it to your CRM for testing.</p>

          {createResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${createResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {createResult.message}
            </div>
          )}

          <form onSubmit={createTestOrder} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name *</label>
              <input name="customer_name" required className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
              <input name="phone" required className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0123456789" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input name="email" type="email" required className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="john@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
              <input name="product_name" required className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Anti-Odour Cream" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Variation</label>
              <input name="variation" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="50ml" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price (RM)</label>
              <input name="unit_price" type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="49.90" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input name="quantity" type="number" min="1" defaultValue="1" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input name="address_line1" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="123 Jalan Test" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input name="city" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Kuala Lumpur" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input name="state" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Kuala Lumpur" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
              <input name="postcode" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="50000" />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating}
                className="w-full px-4 py-2 bg-olive text-white rounded-lg hover:bg-olive/90 transition-colors text-sm disabled:opacity-50"
              >
                {creating ? "Creating & Syncing to CRM..." : "Create Order & Sync to CRM"}
              </button>
            </div>
          </form>
        </div>
      )}

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
