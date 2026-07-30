"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, Send, MessageCircle } from "lucide-react";

interface AutomationConfig {
  enabled: boolean;
  webhook_url: string;
  flowbuilder_key: string;
  flowbuilder_key_set?: boolean;
  trigger_status: string;
  delay_hours: number;
  activated_at: string | null;
  phone_field: string;
}

const STATUSES = ["pending", "processing", "paid", "shipped", "completed", "cancelled"];

export default function AdminAutomationPage() {
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp-automation")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/whatsapp-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.error || "Failed to save");
      }
    } catch {
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp-automation/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone }),
      });
      const data = await res.json();
      setTestResult(
        res.ok && data.ok
          ? `Sent to ${data.sent_to} — Strive replied ${data.strive_status}`
          : `Failed: ${data.error || `${data.strive_status} ${data.strive_response}`}`,
      );
    } catch {
      setTestResult("Request failed");
    } finally {
      setTesting(false);
    }
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-olive" />
      </div>
    );
  }

  const set = <K extends keyof AutomationConfig>(k: K, v: AutomationConfig[K]) =>
    setConfig({ ...config, [k]: v });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">WhatsApp Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Follow up automatically on orders that stay unpaid, via Strive
          </p>
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
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <MessageCircle className="w-5 h-5" /> Unpaid order reminder
              </h2>
              <p className="text-sm text-gray-500">
                Messages the customer once, if their order is still unpaid after the delay
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order status</label>
              <select
                value={config.trigger_status}
                onChange={(e) => set("trigger_status", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-olive/30"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Send after (hours)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={config.delay_hours}
                onChange={(e) => set("delay_hours", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
              />
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <p>Only orders placed <strong>after you switch this on</strong> are messaged — existing orders are never chased.</p>
            <p>A customer gets <strong>one message</strong> even if they have several unpaid orders from retrying checkout.</p>
            <p>A customer who <strong>went on to pay</strong> is skipped — failed attempts before a successful order never trigger a reminder.</p>
            {config.enabled && config.activated_at && (
              <p className="text-olive pt-1">
                Active since {new Date(config.activated_at).toLocaleString("en-MY")}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Strive connection</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
              <input
                type="url"
                value={config.webhook_url}
                onChange={(e) => set("webhook_url", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-olive/30"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flowbuilder key {config.flowbuilder_key_set && <span className="text-green-600 text-xs">(saved)</span>}
                </label>
                <input
                  type="password"
                  value={config.flowbuilder_key}
                  onChange={(e) => set("flowbuilder_key", e.target.value)}
                  placeholder="Paste to change"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-olive/30"
                />
                <p className="text-xs text-gray-500 mt-1">Sent as the strive-flowbuilder-key header</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone field name</label>
                <input
                  type="text"
                  value={config.phone_field}
                  onChange={(e) => set("phone_field", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-olive/30"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border rounded-lg p-4 mt-4">
            <p className="text-sm text-gray-600 mb-2">
              These variables are sent to your Strive flow:
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {["customer_name", "order_id", "amount", "payment_url"].map((f) => (
                <span key={f} className="px-2 py-1 bg-white border rounded">{f}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Send a test</h2>
          <p className="text-sm text-gray-500 mb-4">
            Triggers the flow with dummy order details. Save your settings first.
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="0109776875"
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
            />
            <button
              onClick={handleTest}
              disabled={testing || !testPhone.trim()}
              className="px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send test
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-3 ${testResult.startsWith("Sent") ? "text-green-600" : "text-red-600"}`}>
              {testResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
