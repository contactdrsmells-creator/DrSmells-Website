"use client";

import { useEffect, useState, useRef } from "react";
import { Order } from "@/lib/types";
import { Package, ChevronDown, ChevronUp, Plus, X, Search } from "lucide-react";
import { Product } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  processing: "bg-orange-100 text-orange-700",
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
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariation, setSelectedVariation] = useState("");
  const [variationSearch, setVariationSearch] = useState("");
  const [showVariationDropdown, setShowVariationDropdown] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const productRef = useRef<HTMLDivElement>(null);
  const variationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productRef.current && !productRef.current.contains(e.target as Node)) setShowProductDropdown(false);
      if (variationRef.current && !variationRef.current.contains(e.target as Node)) setShowVariationDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      console.error("Failed to load products");
    }
  }

  function getVariationsForProduct(product: Product): { name: string; price: number }[] {
    const results: { name: string; price: number }[] = [];
    if (product.variation_combos && product.variation_combos.length > 0) {
      for (const combo of product.variation_combos) {
        const label = Object.values(combo.selections).join(" / ");
        results.push({ name: label, price: combo.sale_price ?? combo.price });
      }
    } else if (product.variations && product.variations.length > 0) {
      for (const v of product.variations) {
        results.push({ name: v.name, price: v.sale_price ?? v.price });
      }
    }
    if (results.length === 0) {
      results.push({ name: "Default", price: product.sale_price ?? product.price });
    }
    return results;
  }

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setShowProductDropdown(false);
    setSelectedVariation("");
    setVariationSearch("");
    const variations = getVariationsForProduct(product);
    if (variations.length === 1) {
      setSelectedVariation(variations[0].name);
      setVariationSearch(variations[0].name);
      setUnitPrice(variations[0].price.toFixed(2));
    } else {
      setUnitPrice("");
    }
  }

  function selectVariation(name: string, price: number) {
    setSelectedVariation(name);
    setVariationSearch(name);
    setUnitPrice(price.toFixed(2));
    setShowVariationDropdown(false);
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const availableVariations = selectedProduct ? getVariationsForProduct(selectedProduct) : [];
  const filteredVariations = availableVariations.filter((v) =>
    v.name.toLowerCase().includes(variationSearch.toLowerCase())
  );

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
    if (!selectedProduct) {
      setCreateResult({ success: false, message: "Please select a product" });
      return;
    }
    if (!selectedVariation) {
      setCreateResult({ success: false, message: "Please select a variation" });
      return;
    }
    setCreating(true);
    setCreateResult(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const body = {
      customer_name: formData.get("customer_name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      product_name: selectedProduct.name,
      variation: selectedVariation,
      quantity: parseInt(formData.get("quantity") as string) || 1,
      unit_price: parseFloat(unitPrice) || 0,
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
        setSelectedProduct(null);
        setProductSearch("");
        setSelectedVariation("");
        setVariationSearch("");
        setUnitPrice("");
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

  const filteredOrders = orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (o.shipping?.name || "").toLowerCase();
      const email = (o.shipping?.email || "").toLowerCase();
      const phone = (o.shipping?.phone || "").toLowerCase();
      const orderNum = (o.order_number || "").toLowerCase();
      if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !orderNum.includes(q)) return false;
    }
    return true;
  });

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

            {/* Product searchable dropdown */}
            <div className="relative" ref={productRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product *</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); if (!e.target.value) { setSelectedProduct(null); setSelectedVariation(""); setVariationSearch(""); setUnitPrice(""); } }}
                  onFocus={() => setShowProductDropdown(true)}
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                  placeholder="Search product..."
                />
              </div>
              {showProductDropdown && productSearch && (
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">No products found</div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${selectedProduct?.id === p.id ? "bg-olive/10 font-medium" : ""}`}
                      >
                        {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                        <div>
                          <div className="text-gray-800">{p.name}</div>
                          <div className="text-xs text-gray-400">RM {(p.sale_price ?? p.price).toFixed(2)}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Variation searchable dropdown */}
            <div className="relative" ref={variationRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Variation *</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={variationSearch}
                  onChange={(e) => { setVariationSearch(e.target.value); setShowVariationDropdown(true); setSelectedVariation(""); }}
                  onFocus={() => setShowVariationDropdown(true)}
                  disabled={!selectedProduct}
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder={selectedProduct ? "Search variation..." : "Select product first"}
                />
              </div>
              {showVariationDropdown && selectedProduct && (
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredVariations.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">No variations found</div>
                  ) : (
                    filteredVariations.map((v, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectVariation(v.name, v.price)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between ${selectedVariation === v.name ? "bg-olive/10 font-medium" : ""}`}
                      >
                        <span className="text-gray-800">{v.name}</span>
                        <span className="text-gray-500">RM {v.price.toFixed(2)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price (RM)</label>
              <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50" placeholder="Auto-filled" readOnly />
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
              <input name="state" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Selangor" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
              <input name="postcode" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="50000" />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating || !selectedProduct || !selectedVariation}
                className="w-full px-4 py-2 bg-olive text-white rounded-lg hover:bg-olive/90 transition-colors text-sm disabled:opacity-50"
              >
                {creating ? "Creating & Syncing to CRM..." : "Create Order & Sync to CRM"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm bg-white"
            placeholder="Search by name, email, phone, or order ID..."
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending", "processing", "paid", "shipped", "completed", "cancelled"].map((s) => (
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
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="hidden md:grid grid-cols-[0.8fr_1fr_1.2fr_90px_90px_90px_80px_40px] gap-2 px-6 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Order ID</span>
            <span>Customer</span>
            <span>Email</span>
            <span>Status</span>
            <span>Source</span>
            <span className="text-right">Total</span>
            <span className="text-right">Date</span>
            <span></span>
          </div>

          <div className="divide-y">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const customerName = order.shipping?.name || "—";
            const customerEmail = order.shipping?.email || "—";
            const source = order.source || "Direct";
            return (
              <div key={order.id}>
                {/* Order row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[0.8fr_1fr_1.2fr_90px_90px_90px_80px_40px] gap-2 items-center">
                    <span className="font-semibold text-gray-800 text-sm">{order.order_number}</span>
                    <div>
                      <p className="text-sm text-gray-800">{customerName}</p>
                      <p className="text-xs text-gray-400">{order.shipping?.phone || ""}</p>
                    </div>
                    <span className="text-sm text-gray-500 truncate">{customerEmail}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium text-center ${STATUS_COLORS[order.status] || "bg-gray-100"}`}>
                      {order.status}
                    </span>
                    <span className="text-xs text-gray-500 text-center capitalize">{source}</span>
                    <span className="text-sm font-semibold text-gray-800 text-right">RM {Number(order.total).toFixed(2)}</span>
                    <span className="text-xs text-gray-500 text-right">
                      {new Date(order.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                    <span className="flex justify-end">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </span>
                  </div>
                  {/* Mobile row */}
                  <div className="md:hidden flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{order.order_number}</p>
                      <p className="text-xs text-gray-500">{customerName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || "bg-gray-100"}`}>
                          {order.status}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(order.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm">RM {Number(order.total).toFixed(2)}</p>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
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
                            {/* Shown above Shipping, where it was applied. The
                                discount was recorded on every order all along;
                                nothing displayed it, so the only clue a voucher
                                had been used was a total that did not add up. */}
                            {Number(order.discount) > 0 && (
                              <div className="flex justify-between text-sm text-green-600">
                                <span>
                                  Discount
                                  {order.voucher_code && (
                                    <span className="font-mono text-xs ml-1">({order.voucher_code})</span>
                                  )}
                                </span>
                                <span>− RM {Number(order.discount).toFixed(2)}</span>
                              </div>
                            )}
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
                          <option value="processing">Processing</option>
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
        </div>
      )}
    </div>
  );
}
