"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

interface Rules {
  earn_per_ringgit: number;
  points_per_ringgit: number;
  min_redeem: number;
  expiry_months: number;
  signup_bonus: number;
  enabled: boolean;
}

interface Customer {
  id: string;
  phone: string;
  name: string | null;
  balance: number;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminPoints() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/admin/points");
    if (!res.ok) return;
    const data = await res.json();
    setRules(data.rules);
    setCustomers(data.customers || []);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!rules) return;
    setSaving(true);
    const res = await fetch("/api/admin/points", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    setSaving(false);
    setToast(res.ok ? "Saved" : "Could not save");
    setTimeout(() => setToast(""), 2500);
  }

  async function adjust(customer: Customer) {
    const raw = prompt(
      `Points to add or take away for ${customer.name || customer.phone}.\n\nUse a minus sign to take points away, e.g. -50.`,
    );
    if (!raw) return;
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) return;
    const note = prompt("Why? This is kept with the entry.") || "";

    const res = await fetch("/api/admin/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customer.id, delta, note }),
    });
    if (res.ok) {
      setToast("Adjusted");
      setTimeout(() => setToast(""), 2500);
      load();
    } else {
      alert("Could not adjust the balance");
    }
  }

  const shown = customers.filter((c) =>
    `${c.name || ""} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const outstanding = customers.reduce((sum, c) => sum + c.balance, 0);

  if (!rules) {
    return <div className="p-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  const ringgitPer100 = rules.points_per_ringgit
    ? (100 / rules.points_per_ringgit).toFixed(2)
    : "0.00";

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Points</h1>
      <p className="text-gray-500 text-sm mb-8">
        What customers earn, what it is worth, and who holds what.
      </p>

      {toast && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-xl border p-6 mb-8">
        <label className="flex items-center gap-2 mb-5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-olive"
            checked={rules.enabled}
            onChange={(e) => setRules({ ...rules, enabled: e.target.checked })}
          />
          <span className="text-sm font-medium text-gray-700">
            Points are switched on
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            ["earn_per_ringgit", "Points earned per RM1 spent"],
            ["points_per_ringgit", "Points needed for RM1 off"],
            ["min_redeem", "Fewest points that can be used at once"],
            ["expiry_months", "Months before points expire (0 = never)"],
            ["signup_bonus", "Welcome bonus for a new account"],
          ] as [keyof Rules, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={String(rules[key])}
                onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          As set: a customer spending RM100 earns {Math.floor(100 * rules.earn_per_ringgit)} points,
          and 100 points is worth RM{ringgitPer100} off — about{" "}
          {rules.points_per_ringgit
            ? ((rules.earn_per_ringgit / rules.points_per_ringgit) * 100).toFixed(1)
            : "0"}
          % back.
        </p>

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-800">Customers</h2>
            <p className="text-xs text-gray-500">
              {customers.length} accounts · {outstanding.toLocaleString()} points outstanding
              {rules.points_per_ringgit
                ? ` (RM${(outstanding / rules.points_per_ringgit).toFixed(2)} if all were spent)`
                : ""}
            </p>
          </div>
          <input
            type="text"
            placeholder="Search name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-56"
          />
        </div>

        {shown.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Joined</th>
                <th className="text-left px-4 py-2 font-medium">Last seen</th>
                <th className="text-right px-4 py-2 font-medium">Points</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">
                    <span className="text-gray-800">{c.name || "—"}</span>
                    <span className="block text-xs text-gray-400">{c.phone}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {c.last_login_at ? new Date(c.last_login_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                    {c.balance.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => adjust(c)}
                      className="text-xs text-olive hover:underline"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
