"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Save, Send } from "lucide-react";

/**
 * Admin box for the WhatsApp login code: which Chatshero workflow sends it.
 * The secret is write-only here — the page only ever learns whether one is saved.
 */
export default function WhatsAppLoginCode() {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [secretSet, setSecretSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/whatsapp-otp")
      .then((r) => r.json())
      .then((d) => {
        setUrl(d.webhook_url || "");
        setSecret(d.secret || "");
        setSecretSet(!!d.secret_set);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/whatsapp-otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: url, secret }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save");
      if (secret && !secret.startsWith("•")) setSecretSet(true);
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    }
    setSaving(false);
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await fetch("/api/whatsapp-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(
        r.ok && d.ok
          ? { ok: true, text: `Sent code ${d.code} to ${d.sent_to} — check WhatsApp` }
          : { ok: false, text: `Failed: ${d.error || `${d.status} ${d.response || ""}`}` },
      );
    } catch {
      setMsg({ ok: false, text: "Request failed" });
    }
    setTesting(false);
  }

  const input = "w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-olive/30";

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
        <KeyRound className="w-5 h-5" /> Login code (website account)
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        The Chatshero workflow that sends the 6-digit code when a customer logs in or forgets their password.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/webhooks/…" className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Webhook secret {secretSet && <span className="text-green-600 text-xs">(saved)</span>}
          </label>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
            onFocus={() => secret.startsWith("•") && setSecret("")}
            placeholder="Paste the secret from Chatshero" autoComplete="off" className={input} />
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-olive text-white rounded-lg text-sm hover:bg-sage-dark transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      <div className="bg-gray-50 border rounded-lg p-4 mt-4 text-sm text-gray-600 space-y-1">
        <p>Variables sent to the workflow:</p>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {["phone", "code", "minutes"].map((f) => (
            <span key={f} className="px-2 py-1 bg-white border rounded">{f}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="0109776875" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30" />
        <button onClick={test} disabled={testing || !phone.trim()}
          className="px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test code
        </button>
      </div>
      {msg && <p className={`text-sm mt-3 ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
