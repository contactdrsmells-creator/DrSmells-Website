"use client";

import { use, useEffect, useState } from "react";
import { Loader2, Tag } from "lucide-react";

/**
 * Where a "complete your payment" link lands: the order, a promo code box,
 * and a Pay button that goes on to the gateway at the current price.
 *
 * Nothing is typed again — the order already holds the delivery details.
 */

interface Summary {
  order_number: string;
  paid: boolean;
  first_name: string;
  items: { name: string; variation: string; quantity: number; line_total: number }[];
  subtotal: number;
  discount: number;
  points_discount: number;
  shipping_cost: number;
  voucher_code: string | null;
  total: number;
}

const rm = (n: number) => `RM ${n.toFixed(2)}`;

export default function ResumePaymentPage({ params }: { params: Promise<{ order: string }> }) {
  const { order } = use(params);
  const orderNumber = encodeURIComponent(String(order || "").toUpperCase());

  const [summary, setSummary] = useState<Summary | null>(null);
  const [missing, setMissing] = useState(false);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${orderNumber}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Summary) => {
        if (d.paid) {
          window.location.replace(`/order-confirmation?order=${orderNumber}`);
          return;
        }
        setSummary(d);
      })
      .catch(() => setMissing(true));
  }, [orderNumber]);

  async function apply() {
    if (!code.trim() || applying) return;
    setApplying(true);
    setError("");
    try {
      const r = await fetch(`/api/pay/${orderNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not apply the promo code");
      setSummary(d);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the promo code");
    }
    setApplying(false);
  }

  if (missing) {
    return (
      <div className="min-h-[60vh] bg-white flex flex-col items-center justify-center px-4 text-center">
        <p className="text-olive text-lg font-semibold mb-2">We couldn&apos;t find this order</p>
        <p className="text-olive/60 text-sm">Please check the link, or message us on WhatsApp.</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-[60vh] bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-olive/60" />
      </div>
    );
  }

  return (
    <div className="bg-white max-w-lg mx-auto px-4 py-10 md:py-16">
      <h1 className="text-2xl md:text-3xl font-bold text-olive mb-1">Complete your payment</h1>
      <p className="text-sm text-olive/60 mb-8">
        {summary.first_name ? `Hi ${summary.first_name}, ` : ""}order {summary.order_number}
      </p>

      <div className="bg-gray-50 rounded-xl p-6">
        <div className="space-y-3 mb-6">
          {summary.items.map((item, i) => (
            <div key={i} className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-olive">{item.name}</p>
                <p className="text-xs text-olive/50">
                  {item.variation ? `${item.variation} x ${item.quantity}` : `x ${item.quantity}`}
                </p>
              </div>
              <p className="text-sm font-medium text-olive whitespace-nowrap">{rm(item.line_total)}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-olive/10 pt-4 mb-4">
          {summary.voucher_code ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Tag className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">{summary.voucher_code} applied</span>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Promo code"
                  value={code}
                  maxLength={40}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())}
                  className="flex-1 min-w-0 px-3 py-2 border border-olive/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
                />
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying || !code.trim()}
                  className="px-4 py-2 bg-olive text-white text-sm font-medium rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50"
                >
                  {applying ? "..." : "Apply"}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )}
        </div>

        <div className="border-t border-olive/10 pt-4 space-y-2">
          <div className="flex justify-between text-sm text-olive/70">
            <span>Subtotal</span>
            <span>{rm(summary.subtotal)}</span>
          </div>
          {summary.discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>-{rm(summary.discount)}</span>
            </div>
          )}
          {summary.points_discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Points</span>
              <span>-{rm(summary.points_discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-olive/70">
            <span>Shipping</span>
            <span>{summary.shipping_cost === 0 ? "FREE" : rm(summary.shipping_cost)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-olive pt-2 border-t border-olive/10">
            <span>Total</span>
            <span>{rm(summary.total)}</span>
          </div>
        </div>

        <a
          href={`/pay/${orderNumber}?go=1`}
          onClick={() => setPaying(true)}
          className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-olive text-white font-medium rounded-lg hover:bg-sage-dark transition-colors"
        >
          {paying && <Loader2 className="w-4 h-4 animate-spin" />}
          Pay {rm(summary.total)}
        </a>
      </div>
    </div>
  );
}
