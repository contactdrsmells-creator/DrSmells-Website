"use client";

import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";

interface PaymentSettings {
  senangpay_enabled: boolean;
  stripe_enabled: boolean;
  doku_enabled: boolean;
  shipping_cost: string;
  free_shipping_threshold: string;
  currency: string;
}

export default function AdminPaymentPage() {
  const [settings, setSettings] = useState<PaymentSettings>({
    senangpay_enabled: false,
    stripe_enabled: false,
    doku_enabled: false,
    shipping_cost: "10.00",
    free_shipping_threshold: "100.00",
    currency: "MYR",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/payment-settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert("Failed to save settings");
      }
    } catch {
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payment Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure payment gateways and shipping</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-olive text-white rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <div className="space-y-6">
        {/* SenangPay */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">SenangPay</h2>
              <p className="text-sm text-gray-500">Malaysian payment gateway — Online Banking, FPX, Credit/Debit Card</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.senangpay_enabled}
                onChange={(e) => setSettings({ ...settings, senangpay_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
            </label>
          </div>
          {settings.senangpay_enabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Setup required:</strong> Add these environment variables to your Vercel project:
              </p>
              <ul className="text-sm text-yellow-700 mt-2 space-y-1 list-disc list-inside">
                <li><code className="bg-yellow-100 px-1 rounded">SENANGPAY_MERCHANT_ID</code> — Your SenangPay merchant ID</li>
                <li><code className="bg-yellow-100 px-1 rounded">SENANGPAY_SECRET_KEY</code> — Your SenangPay secret key</li>
                <li><code className="bg-yellow-100 px-1 rounded">SENANGPAY_URL</code> — (optional) defaults to https://app.senangpay.my/payment</li>
              </ul>
              <p className="text-sm text-yellow-700 mt-2">
                Set the <strong>Return URL</strong> in SenangPay dashboard to: <code className="bg-yellow-100 px-1 rounded">your-domain.com/api/webhooks/senangpay</code>
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Set the <strong>Callback URL</strong> to the same URL.
              </p>
            </div>
          )}
        </div>

        {/* Stripe */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Stripe</h2>
              <p className="text-sm text-gray-500">International payment gateway — Credit/Debit Card</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.stripe_enabled}
                onChange={(e) => setSettings({ ...settings, stripe_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
            </label>
          </div>
          {settings.stripe_enabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Setup required:</strong> Add these environment variables to your Vercel project:
              </p>
              <ul className="text-sm text-yellow-700 mt-2 space-y-1 list-disc list-inside">
                <li><code className="bg-yellow-100 px-1 rounded">STRIPE_SECRET_KEY</code> — Your Stripe secret key</li>
                <li><code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> — Your Stripe publishable key</li>
                <li><code className="bg-yellow-100 px-1 rounded">STRIPE_WEBHOOK_SECRET</code> — Your Stripe webhook signing secret</li>
              </ul>
              <p className="text-sm text-yellow-700 mt-2">
                Set the Stripe webhook endpoint to: <code className="bg-yellow-100 px-1 rounded">your-domain.com/api/webhooks/stripe</code>
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Listen for the <code className="bg-yellow-100 px-1 rounded">checkout.session.completed</code> event.
              </p>
            </div>
          )}
        </div>

        {/* DOKU */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">DOKU</h2>
              <p className="text-sm text-gray-500">Malaysian payment gateway — FPX, E-Wallet, BNPL, Credit/Debit Card</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.doku_enabled}
                onChange={(e) => setSettings({ ...settings, doku_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
            </label>
          </div>
          {settings.doku_enabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Setup required:</strong> Add these environment variables to your Vercel project:
              </p>
              <ul className="text-sm text-yellow-700 mt-2 space-y-1 list-disc list-inside">
                <li><code className="bg-yellow-100 px-1 rounded">DOKU_CLIENT_ID</code> — Your DOKU Client ID (e.g., BRN-001-XXXXXXX)</li>
                <li><code className="bg-yellow-100 px-1 rounded">DOKU_SECRET_KEY</code> — Your DOKU API Secret Key</li>
                <li><code className="bg-yellow-100 px-1 rounded">DOKU_API_URL</code> — (optional) defaults to <code className="bg-yellow-100 px-1 rounded">https://api-sandbox.doku.com</code>. Set to <code className="bg-yellow-100 px-1 rounded">https://api.doku.com</code> for production.</li>
              </ul>
              <p className="text-sm text-yellow-700 mt-2">
                Set the <strong>Callback URL</strong> in DOKU dashboard to: <code className="bg-yellow-100 px-1 rounded">your-domain.com/api/webhooks/doku</code>
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                <strong>Supported payment channels:</strong> FPX (Internet Banking), Touch &apos;n Go, GrabPay, ShopeePay, BNPL, Credit/Debit Card
              </p>
            </div>
          )}
        </div>

        {/* Shipping */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Shipping</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Cost (RM)</label>
              <input
                type="text"
                value={settings.shipping_cost}
                onChange={(e) => setSettings({ ...settings, shipping_cost: e.target.value })}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Free Shipping Threshold (RM)</label>
              <input
                type="text"
                value={settings.free_shipping_threshold}
                onChange={(e) => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30"
              />
              <p className="text-xs text-gray-400 mt-1">Orders above this amount get free shipping. Set to 0 to disable.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
