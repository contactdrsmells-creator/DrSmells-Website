"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, CircleHelp, Coins, RefreshCw } from "lucide-react";

/**
 * Reconciling what the shop recorded against what the payment providers say.
 *
 * Run on a button rather than on load: each run is several hundred live
 * lookups against Atome and Stripe, which should happen because somebody asked
 * for it and not because they opened a page.
 */

interface Problem {
  order_number: string;
  payment_method: string;
  website_status: string;
  provider_status: string | null;
  website_total: number;
  provider_amount: number | null;
  created_at: string;
  customer?: string;
  verdict: "ghost_paid" | "missed_payment" | "amount_mismatch" | "unknown";
  note?: string;
}

interface Result {
  checked: number;
  days: number;
  summary: Record<string, number>;
  problems: Problem[];
  atRisk: number;
  uncollected: number;
}

const VERDICTS = {
  ghost_paid: {
    label: "Do not ship",
    blurb: "Marked paid here, but the provider has no completed payment. Check before posting.",
    row: "bg-red-50 border-red-200",
    pill: "bg-red-100 text-red-700",
  },
  missed_payment: {
    label: "Paid, not recorded",
    blurb: "The customer paid and the website never recorded it. They are waiting for this parcel.",
    row: "bg-amber-50 border-amber-200",
    pill: "bg-amber-100 text-amber-700",
  },
  amount_mismatch: {
    label: "Amount differs",
    blurb: "Both agree it was paid, but not on how much.",
    row: "bg-orange-50 border-orange-200",
    pill: "bg-orange-100 text-orange-700",
  },
  unknown: {
    label: "Could not check",
    blurb:
      "This check could not reach the provider for this order. It is not a sign the payment failed — " +
      "the order's own status is unchanged and still comes from the provider's own confirmation.",
    row: "bg-stone-50 border-stone-200",
    pill: "bg-stone-200 text-stone-600",
  },
} as const;

const METHOD_OPTIONS = [
  { value: "atome,stripe", label: "Atome + Stripe" },
  { value: "atome", label: "Atome only" },
  { value: "stripe", label: "Stripe only" },
  { value: "atome,stripe,doku", label: "All three (slow)" },
];

export default function PaymentAuditPage() {
  const [days, setDays] = useState(30);
  const [methods, setMethods] = useState("atome,stripe");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/admin/payment-audit?methods=${methods}&days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The check failed");
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const ordered = result
    ? [...result.problems].sort(
        (a, b) =>
          ["ghost_paid", "missed_payment", "amount_mismatch", "unknown"].indexOf(a.verdict) -
          ["ghost_paid", "missed_payment", "amount_mismatch", "unknown"].indexOf(b.verdict),
      )
    : [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-olive">Payment Check</h1>
      <p className="text-olive/60 mt-1 mb-6 text-sm">
        Asks Atome and Stripe what really happened to each order, and shows only where they
        disagree with this website. Nothing is changed — anything found is for you to settle.
        An order it cannot reach the provider about is reported as “could not check”, which is
        not a sign the payment failed: no order is ever marked paid or unpaid by this page, and
        none is ever marked paid because a provider stayed silent.
      </p>

      <div className="flex flex-wrap items-end gap-3 p-4 border border-olive/15 rounded-xl bg-sage-light/20 mb-6">
        <div>
          <label className="block text-xs font-medium text-olive/70 mb-1">Payment method</label>
          <select
            value={methods}
            onChange={(e) => setMethods(e.target.value)}
            className="px-3 py-2 border border-olive/20 rounded-lg text-sm text-olive bg-white"
          >
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-olive/70 mb-1">Going back</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-olive/20 rounded-lg text-sm text-olive bg-white"
          >
            {[7, 30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-5 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage disabled:opacity-50 flex items-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? "Checking…" : "Run check"}
        </button>
        {running && (
          <p className="text-xs text-olive/50 w-full">
            Each order is a live lookup, so a few hundred takes a minute or two. Leave this page open.
          </p>
        )}
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-xl text-sm text-red-700 mb-6">{error}</div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Agree"
              value={String(result.summary.ok ?? 0)}
              tone="text-green-700 bg-green-50 border-green-200"
            />
            <Stat
              icon={<ShieldAlert className="w-4 h-4" />}
              label="Do not ship"
              value={String(result.summary.ghost_paid ?? 0)}
              tone="text-red-700 bg-red-50 border-red-200"
            />
            <Stat
              icon={<Coins className="w-4 h-4" />}
              label="Paid, not recorded"
              value={String(result.summary.missed_payment ?? 0)}
              tone="text-amber-700 bg-amber-50 border-amber-200"
            />
            <Stat
              icon={<CircleHelp className="w-4 h-4" />}
              label="Could not check"
              value={String(result.summary.unknown ?? 0)}
              tone="text-stone-600 bg-stone-50 border-stone-200"
            />
          </div>

          <p className="text-sm text-olive/60 mb-4">
            Checked {result.checked} orders from the last {result.days} days.
            {result.atRisk > 0 && (
              <> <strong className="text-red-700">RM{result.atRisk.toFixed(2)}</strong> of goods are at risk of being shipped unpaid.</>
            )}
            {result.uncollected > 0 && (
              <> <strong className="text-amber-700">RM{result.uncollected.toFixed(2)}</strong> was paid but never recorded here.</>
            )}
          </p>

          {ordered.length === 0 ? (
            <div className="p-6 border border-green-200 bg-green-50 rounded-xl text-sm text-green-800">
              Every order matches its provider. Nothing to settle.
            </div>
          ) : (
            <div className="space-y-2">
              {ordered.map((p) => {
                const v = VERDICTS[p.verdict];
                return (
                  <div key={p.order_number} className={`p-4 border rounded-xl ${v.row}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${v.pill}`}>
                        {v.label}
                      </span>
                      <span className="font-semibold text-olive">{p.order_number}</span>
                      <span className="text-xs text-olive/50 uppercase">{p.payment_method}</span>
                      {p.customer && <span className="text-xs text-olive/60">· {p.customer}</span>}
                      <span className="text-xs text-olive/40 ml-auto">
                        {new Date(p.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}
                      </span>
                    </div>
                    <p className="text-sm text-olive/70">{p.note || v.blurb}</p>
                    <p className="text-xs text-olive/50 mt-1">
                      Website: {p.website_status} · RM{p.website_total.toFixed(2)}
                      {"  →  "}
                      Provider: {p.provider_status ?? "no answer"}
                      {p.provider_amount != null && ` · RM${p.provider_amount.toFixed(2)}`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`p-3 border rounded-xl ${tone}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
