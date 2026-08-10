"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2, X } from "lucide-react";

interface Voucher {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  applicable_for_subscription: boolean;
  free_shipping: boolean;
  created_at: string;
}

const emptyVoucher = {
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  discount_value: 0,
  min_order_amount: 0,
  max_uses: "",
  start_date: "",
  end_date: "",
  active: true,
  applicable_for_subscription: false,
  free_shipping: false,
};

interface UsageOrder {
  order_number: string;
  customer: string;
  email: string;
  total: number;
  discount: number;
  created_at: string;
}

interface UsageSummary {
  orders: number;
  discount: number;
  revenue: number;
}

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState(emptyVoucher);
  const [saving, setSaving] = useState(false);

  // Usage is counted from paid orders rather than read off the voucher, so it
  // is loaded separately.
  const [counts, setCounts] = useState<Record<string, UsageSummary>>({});
  const [detail, setDetail] = useState<{ code: string; orders: UsageOrder[]; summary: UsageSummary } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadVouchers();
    loadCounts();
  }, []);

  async function loadCounts() {
    try {
      const res = await fetch("/api/admin/voucher-usage");
      if (!res.ok) return;
      const data = await res.json();
      setCounts(data.counts || {});
    } catch {
      // The list still works without it; usage simply shows as unknown.
    }
  }

  async function openUsage(code: string) {
    setDetailLoading(true);
    setDetail({ code, orders: [], summary: { orders: 0, discount: 0, revenue: 0 } });
    try {
      const res = await fetch(`/api/admin/voucher-usage?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok) setDetail({ code, orders: data.orders || [], summary: data.summary });
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadVouchers() {
    try {
      const res = await fetch("/api/vouchers");
      const data = await res.json();
      setVouchers(data.vouchers || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyVoucher);
    setShowForm(true);
  }

  function openEdit(v: Voucher) {
    setEditing(v);
    setForm({
      code: v.code,
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      min_order_amount: v.min_order_amount,
      max_uses: v.max_uses?.toString() || "",
      start_date: v.start_date?.slice(0, 10) || "",
      end_date: v.end_date?.slice(0, 10) || "",
      active: v.active,
      applicable_for_subscription: v.applicable_for_subscription ?? false,
      free_shipping: v.free_shipping ?? false,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.code.trim()) {
      alert("Voucher code is required");
      return;
    }
    if (form.discount_value <= 0 && !form.free_shipping) {
      alert("Discount value must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        ...(editing ? { id: editing.id } : {}),
      };

      const res = await fetch("/api/vouchers", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowForm(false);
        setEditing(null);
        setForm(emptyVoucher);
        await loadVouchers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save voucher");
      }
    } catch {
      alert("Error saving voucher");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this voucher?")) return;
    try {
      await fetch(`/api/vouchers?id=${id}`, { method: "DELETE" });
      await loadVouchers();
    } catch {
      alert("Error deleting voucher");
    }
  }

  async function toggleActive(v: Voucher) {
    try {
      await fetch("/api/vouchers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, active: !v.active }),
      });
      await loadVouchers();
    } catch {
      alert("Error updating voucher");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-olive" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vouchers</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage discount voucher codes</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-olive text-white rounded-lg hover:bg-sage-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Voucher
        </button>
      </div>

      {/* Voucher Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {editing ? "Edit Voucher" : "Create Voucher"}
              </h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME10"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm({ ...form, discount_type: e.target.value as "percentage" | "fixed" })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30 bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (RM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Value {form.discount_type === "percentage" ? "(%)" : "(RM)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.discount_value || ""}
                    onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order Amount (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.min_order_amount || ""}
                    onChange={(e) => setForm({ ...form, min_order_amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0 = no minimum"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    placeholder="Empty = unlimited"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
                  </label>
                  <span className="text-sm text-gray-700">Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.applicable_for_subscription}
                      onChange={(e) => setForm({ ...form, applicable_for_subscription: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
                  </label>
                  <span className="text-sm text-gray-700">Apply to subscription</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.free_shipping}
                      onChange={(e) => setForm({ ...form, free_shipping: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
                  </label>
                  <span className="text-sm text-gray-700">Free shipping</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vouchers List */}
      {vouchers.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-gray-500 mb-4">No vouchers created yet</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-olive text-white rounded-lg text-sm hover:bg-sage-dark transition-colors"
          >
            Create your first voucher
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Discount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Min Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Usage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Validity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-olive">{v.code}</td>
                    <td className="px-4 py-3">
                      {v.discount_type === "percentage"
                        ? `${v.discount_value}%`
                        : `RM${v.discount_value.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {v.min_order_amount > 0 ? `RM${v.min_order_amount.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {/* Paid orders only, and clickable through to them —
                          a number with nothing behind it was what made the old
                          count impossible to check. */}
                      <button
                        onClick={() => openUsage(v.code)}
                        className="text-olive hover:text-sage-dark font-medium underline decoration-dotted underline-offset-2"
                        title="See the paid orders that used this voucher"
                      >
                        {counts[v.code.toUpperCase()]?.orders ?? 0}
                        {v.max_uses ? ` / ${v.max_uses}` : " / ∞"}
                      </button>
                      <span className="block text-[11px] text-gray-400">paid orders</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {v.start_date && v.end_date
                        ? `${new Date(v.start_date).toLocaleDateString()} – ${new Date(v.end_date).toLocaleDateString()}`
                        : v.end_date
                        ? `Until ${new Date(v.end_date).toLocaleDateString()}`
                        : "No expiry"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(v)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          v.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(v)}
                          className="text-olive hover:text-sage-dark text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-3xl mt-10 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold text-olive font-mono">{detail.code}</h2>
                <p className="text-xs text-gray-500">Paid orders that used this voucher</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 divide-x border-b text-center">
              <div className="px-4 py-3">
                <p className="text-lg font-semibold text-olive">{detail.summary.orders}</p>
                <p className="text-xs text-gray-500">Paid orders</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-lg font-semibold text-olive">RM {detail.summary.discount.toFixed(2)}</p>
                <p className="text-xs text-gray-500">Discount given</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-lg font-semibold text-olive">RM {detail.summary.revenue.toFixed(2)}</p>
                <p className="text-xs text-gray-500">Revenue</p>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {detailLoading ? (
                <div className="py-10 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </div>
              ) : detail.orders.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  No paid order has used this voucher yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Order</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Customer</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Discount</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.orders.map((o) => (
                      <tr key={o.order_number} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-olive">{o.order_number}</td>
                        <td className="px-4 py-2">
                          {o.customer}
                          {o.email && <span className="block text-xs text-gray-400">{o.email}</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {o.discount > 0 ? `− RM ${o.discount.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">RM {o.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
