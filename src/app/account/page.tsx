"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Package, Gift, Crown, Ticket, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * The member area.
 *
 * Four things a member comes here for — their orders, their standing
 * subscriptions, how far up the ladder they are, and what they have to spend —
 * behind tabs rather than down one long page, because on a phone a stack of
 * four sections means the one you came for is always the one below the fold.
 *
 * Orders, subscriptions and vouchers each load when their tab is first opened.
 * Subscriptions in particular mean asking Stripe, and nobody should wait on
 * that to look at their points.
 *
 * A guest sees none of it and still gets the order tracker: looking up one
 * order should never require an account.
 */

interface OrderItem {
  product_name?: string;
  variation?: string;
  quantity?: number;
  total_price?: number;
  subscription?: { interval_months: number; price: number } | null;
}

interface MemberOrder {
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  discount?: number;
  voucher_code?: string | null;
  items: OrderItem[];
  created_at: string;
}

interface Tier {
  id: string;
  name: string;
  min_points: number;
  earn_multiplier: number;
  benefits: string | null;
  colour: string | null;
}

interface Me {
  customer: { name: string | null; phone: string };
  balance: number;
  value: number;
  history: { delta: number; reason: string; order_number: string | null; created_at: string }[];
  rules: { min_redeem: number; points_per_ringgit: number };
  tier: { current: Tier | null; next: Tier | null; earned: number; toNext: number; progress: number };
  tiers: Tier[];
  orders: MemberOrder[];
}

interface Subscription {
  id: string;
  order_number: string;
  started_at: string;
  status: string | null;
  next_charge: string | null;
  amount: number | null;
  deliveries: number;
  items: { name: string; variation: string | null; quantity: number; interval_months: number | null; price: number | null }[];
}

interface Voucher {
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  free_shipping: boolean;
  end_date: string | null;
  used_by_you: boolean;
}

type Tab = "points" | "orders" | "subscription" | "vouchers";

const TABS: { key: Tab; label: string; icon: typeof Gift }[] = [
  { key: "points", label: "Points", icon: Gift },
  { key: "orders", label: "Orders", icon: Package },
  { key: "subscription", label: "Subscription", icon: RefreshCw },
  { key: "vouchers", label: "Vouchers", icon: Ticket },
];

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Order status in the shop's own palette, with red kept for real trouble. */
function statusStyle(status: string) {
  const s = status.toLowerCase();
  if (s === "cancelled" || s === "refunded") return "bg-red-50 text-red-600";
  if (s === "completed" || s === "delivered") return "bg-sage-light/40 text-olive";
  if (s === "shipped") return "bg-sage/15 text-sage";
  if (s === "pending") return "bg-amber-50 text-amber-700";
  return "bg-olive/10 text-olive";
}

export default function AccountPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<{
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    created_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("points");

  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[] | null>(null);
  const [copied, setCopied] = useState("");

  /**
   * The balance first, then whatever the CRM adds to it.
   *
   * Both used to arrive together, so nothing showed until the CRM had answered
   * across the network — three to five seconds to display a figure already
   * sitting in our own database. The page now paints on what we hold, and asks
   * for it again only if the chat orders turned out to add something.
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/customer/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setMe(d?.customer ? d : null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMeLoading(false); });

    // Deliberately not chained to the above: the balance must show the moment
    // it arrives, not when this finishes. A guest gets a 401 and nothing else.
    fetch("/api/customer/sync", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((sync) => {
        if (cancelled || !sync?.awarded) return;
        return fetch("/api/customer/me")
          .then((r) => (r.ok ? r.json() : null))
          .then((fresh) => { if (!cancelled && fresh?.customer) setMe(fresh); });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // Fetched when the tab is first opened, not before. Subscriptions mean
  // asking Stripe, and nobody should wait on that to read their points.
  useEffect(() => {
    if (!me) return;
    if (tab === "subscription" && subs === null) {
      fetch("/api/customer/subscriptions")
        .then((r) => (r.ok ? r.json() : { subscriptions: [] }))
        .then((d) => setSubs(d.subscriptions || []))
        .catch(() => setSubs([]));
    }
    if (tab === "vouchers" && vouchers === null) {
      fetch("/api/customer/vouchers")
        .then((r) => (r.ok ? r.json() : { vouchers: [] }))
        .then((d) => setVouchers(d.vouchers || []))
        .catch(() => setVouchers([]));
    }
  }, [tab, me, subs, vouchers]);

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("set-password")) setShowPassword(true);
  }, []);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    const res = await fetch("/api/customer/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPasswordMsg("Password saved. You can use it next time you log in.");
      setNewPassword("");
    } else {
      setPasswordMsg(data.error || "Could not save the password");
    }
  }

  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    setMe(null);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  }

  const reasonLabel: Record<string, string> = {
    order: "Earned from order",
    signup: "Welcome bonus",
    redeemed: "Redeemed at checkout",
    reversed: "Order cancelled",
    manual: "Adjusted by Dr.Smells",
  };

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const res = await fetch(`/api/orders?order_number=${orderNumber.trim()}`);
      const data = await res.json();
      if (data.order) setOrder(data.order);
      else setError("Order not found. Please check your order number.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const tierColour = me?.tier.current?.colour || "#4A5320";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        {!meLoading && !me && (
          <div className="mb-10 rounded-2xl border border-olive/15 p-6 text-center">
            <Gift className="w-8 h-8 text-olive mx-auto mb-3" />
            <p className="text-sm text-olive/70 mb-4">
              Log in to collect points, track your orders and see your rewards.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-3 bg-olive text-cream rounded-xl text-sm font-semibold hover:bg-sage-dark transition-colors"
            >
              Log in or create an account
            </Link>
          </div>
        )}

        {me && (
          <div className="mb-12">
            {/* The card. Points are the headline because they are the figure a
                member opens this page to see; the tier sits above it as a
                label on who they are rather than as a competing number. */}
            <div className="rounded-2xl bg-olive text-cream p-6 mb-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <p className="text-sm opacity-70">{me.customer.name || me.customer.phone}</p>
                {me.tier.current && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0"
                    style={{ background: tierColour, color: "#fff" }}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    {me.tier.current.name}
                  </span>
                )}
              </div>

              <p className="text-5xl font-bold leading-none">{me.balance.toLocaleString()}</p>
              <p className="text-sm opacity-80 mt-2">
                points · worth RM {me.value.toFixed(2)} off your next order
              </p>
              {me.balance < me.rules.min_redeem && (
                <p className="text-xs opacity-60 mt-1">
                  {(me.rules.min_redeem - me.balance).toLocaleString()} more to start redeeming
                </p>
              )}

              {me.tier.next && (
                <div className="mt-5 pt-5 border-t border-cream/15">
                  <div className="flex justify-between text-xs opacity-80 mb-2">
                    <span>{me.tier.toNext.toLocaleString()} points to {me.tier.next.name}</span>
                    <span>{me.tier.earned.toLocaleString()} earned</span>
                  </div>
                  <div className="h-2 rounded-full bg-cream/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sage-light transition-all duration-700"
                      style={{ width: `${Math.round(me.tier.progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {me.tier.current && me.tier.current.earn_multiplier > 1 && (
                <p className="text-xs opacity-70 mt-3">
                  Earning {me.tier.current.earn_multiplier}× points as a {me.tier.current.name} member
                </p>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-olive/5 mb-5 overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                      on ? "bg-olive text-cream" : "text-olive/60 hover:text-olive"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* ── Points ───────────────────────────────────────────────── */}
            {tab === "points" && (
              <div>
                {me.tier.current?.benefits && (
                  <div className="rounded-xl border border-olive/15 p-4 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-olive/50 mb-2">
                      Your {me.tier.current.name} benefits
                    </p>
                    <ul className="space-y-1.5">
                      {me.tier.current.benefits.split("\n").filter(Boolean).map((line, i) => (
                        <li key={i} className="flex gap-2 text-sm text-olive">
                          <span style={{ color: tierColour }}>•</span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* The whole ladder, so somebody can see what is ahead of them
                    rather than only the next rung. */}
                {me.tiers.length > 0 && (
                  <div className="rounded-xl border border-olive/15 divide-y divide-olive/10 mb-4">
                    {me.tiers.map((t) => {
                      const reached = me.tier.earned >= t.min_points;
                      const isCurrent = me.tier.current?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-3 px-4 py-3 ${isCurrent ? "bg-sage-light/20" : ""}`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: reached ? t.colour || "#4A5320" : "#C5CBB0" }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${reached ? "text-olive font-semibold" : "text-olive/40"}`}>
                              {t.name}
                              {isCurrent && <span className="ml-2 text-xs font-normal opacity-60">you are here</span>}
                            </p>
                            <p className="text-xs text-olive/40">
                              {t.min_points.toLocaleString()} points
                              {t.earn_multiplier > 1 && ` · ${t.earn_multiplier}× earning`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {me.history.length > 0 ? (
                  <div className="rounded-xl border border-olive/15 divide-y divide-olive/10">
                    {me.history.map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm text-olive">{reasonLabel[row.reason] || row.reason}</p>
                          <p className="text-xs text-olive/40">
                            {day(row.created_at)}
                            {row.order_number ? ` · ${row.order_number}` : ""}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold ${row.delta > 0 ? "text-sage" : "text-olive/50"}`}>
                          {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-olive/40 text-center py-8">
                    Nothing here yet. Points appear after your first order.
                  </p>
                )}
              </div>
            )}

            {/* ── Orders ───────────────────────────────────────────────── */}
            {tab === "orders" && (
              <div className="space-y-3">
                {me.orders.length === 0 ? (
                  <div className="text-center py-10">
                    <Package className="w-8 h-8 text-olive/20 mx-auto mb-3" />
                    <p className="text-sm text-olive/40 mb-4">No orders yet.</p>
                    <Link href="/shop" className="text-sm text-olive underline">Start shopping</Link>
                  </div>
                ) : (
                  me.orders.map((o) => (
                    <div key={o.order_number} className="rounded-xl border border-olive/15 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-olive">{o.order_number}</p>
                          <p className="text-xs text-olive/40">{day(o.created_at)}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusStyle(o.status)}`}>
                          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                        </span>
                      </div>

                      <div className="space-y-1 mb-3">
                        {(Array.isArray(o.items) ? o.items : []).map((item, i) => (
                          <div key={i} className="flex justify-between gap-3 text-sm">
                            <span className="text-olive/70 min-w-0">
                              {item.product_name}
                              {item.variation ? <span className="text-olive/40"> · {item.variation}</span> : null}
                              {item.subscription ? (
                                <span className="ml-1.5 text-xs text-sage">· subscription</span>
                              ) : null}
                            </span>
                            <span className="text-olive/50 shrink-0">×{item.quantity ?? 1}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-olive/10">
                        <span className="text-xs text-olive/50">
                          {o.voucher_code ? `Voucher ${o.voucher_code}` : ""}
                        </span>
                        <span className="text-sm font-semibold text-olive">
                          RM {Number(o.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Subscription ─────────────────────────────────────────── */}
            {tab === "subscription" && (
              <div className="space-y-3">
                {subs === null ? (
                  <div className="flex justify-center py-10 text-olive/30">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : subs.length === 0 ? (
                  <div className="text-center py-10">
                    <RefreshCw className="w-8 h-8 text-olive/20 mx-auto mb-3" />
                    <p className="text-sm text-olive/50 mb-1">No subscription yet.</p>
                    <p className="text-xs text-olive/40 mb-4">
                      Subscribe on any product and never run out — it arrives on its own.
                    </p>
                    <Link href="/shop" className="text-sm text-olive underline">Browse products</Link>
                  </div>
                ) : (
                  subs.map((s) => {
                    const live = s.status === "active" || s.status === "trialing" || s.status === null;
                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border p-4 ${live ? "border-sage/30 bg-sage-light/10" : "border-olive/15"}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="text-sm font-semibold text-olive">
                              {s.items[0]?.interval_months
                                ? `Every ${s.items[0].interval_months} month${s.items[0].interval_months === 1 ? "" : "s"}`
                                : "Subscription"}
                            </p>
                            <p className="text-xs text-olive/40">
                              Started {day(s.started_at)} · {s.deliveries} delivery{s.deliveries === 1 ? "" : "s"}
                            </p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                            live ? "bg-sage text-white" : "bg-olive/10 text-olive/60"
                          }`}>
                            {s.status ? s.status.replace(/_/g, " ") : "active"}
                          </span>
                        </div>

                        <div className="space-y-1 mb-3">
                          {s.items.map((item, i) => (
                            <div key={i} className="flex justify-between gap-3 text-sm">
                              <span className="text-olive/70">
                                {item.name}
                                {item.variation ? <span className="text-olive/40"> · {item.variation}</span> : null}
                              </span>
                              <span className="text-olive/50 shrink-0">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-olive/10">
                          <span className="text-xs text-olive/60">
                            {s.next_charge && live ? `Next on ${day(s.next_charge)}` : "Not scheduled"}
                          </span>
                          {s.amount !== null && (
                            <span className="text-sm font-semibold text-olive">RM {s.amount.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {subs !== null && subs.length > 0 && (
                  <p className="text-xs text-olive/40 text-center pt-2">
                    To pause, change or cancel a subscription, message us on WhatsApp and we will
                    sort it out for you.
                  </p>
                )}
              </div>
            )}

            {/* ── Vouchers ─────────────────────────────────────────────── */}
            {tab === "vouchers" && (
              <div className="space-y-3">
                {vouchers === null ? (
                  <div className="flex justify-center py-10 text-olive/30">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : vouchers.length === 0 ? (
                  <div className="text-center py-10">
                    <Ticket className="w-8 h-8 text-olive/20 mx-auto mb-3" />
                    <p className="text-sm text-olive/50 mb-1">No vouchers available right now.</p>
                    <p className="text-xs text-olive/40">
                      Your {me.balance.toLocaleString()} points are always ready to use at checkout.
                    </p>
                  </div>
                ) : (
                  vouchers.map((v) => (
                    <div
                      key={v.code}
                      className={`rounded-xl border overflow-hidden ${
                        v.used_by_you ? "border-olive/10 opacity-50" : "border-olive/15"
                      }`}
                    >
                      <div className="flex">
                        {/* The stub, so it reads as a ticket rather than a row. */}
                        <div className="w-24 shrink-0 bg-olive text-cream flex flex-col items-center justify-center p-3">
                          <span className="text-xl font-bold leading-none">
                            {v.free_shipping && v.discount_value === 0
                              ? "FREE"
                              : v.discount_type === "percentage"
                                ? `${v.discount_value}%`
                                : `RM${v.discount_value}`}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide opacity-70 mt-1">
                            {v.free_shipping && v.discount_value === 0 ? "shipping" : "off"}
                          </span>
                        </div>

                        <div className="flex-1 p-4 min-w-0">
                          <p className="text-sm font-semibold text-olive truncate">
                            {v.description || v.code}
                          </p>
                          <p className="text-xs text-olive/50 mt-0.5">
                            {v.min_order_amount > 0
                              ? `On orders over RM${v.min_order_amount.toFixed(2)}`
                              : "No minimum spend"}
                            {v.end_date ? ` · until ${day(v.end_date)}` : ""}
                          </p>

                          {v.used_by_you ? (
                            <p className="text-xs text-olive/40 mt-2">Already used</p>
                          ) : (
                            <button
                              onClick={() => copyCode(v.code)}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-olive/30 text-xs font-mono font-semibold text-olive hover:bg-olive/5"
                            >
                              {copied === v.code ? "Copied!" : v.code}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {vouchers !== null && vouchers.length > 0 && (
                  <Link
                    href="/shop"
                    className="flex items-center justify-center gap-1 text-sm text-olive hover:underline pt-2"
                  >
                    Shop now <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}

            {/* Account housekeeping, below everything it is not about. */}
            <div className="mt-8 pt-6 border-t border-olive/10">
              {showPassword ? (
                <form onSubmit={savePassword} className="rounded-xl border border-olive/15 p-4">
                  <label className="block text-xs font-medium text-olive/70 mb-1">
                    Set a new password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={6}
                      required
                      placeholder="At least 6 characters"
                      className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-olive"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-olive text-cream rounded-lg text-sm font-semibold hover:bg-sage-dark"
                    >
                      Save
                    </button>
                  </div>
                  {passwordMsg && <p className="text-xs text-olive/70 mt-2">{passwordMsg}</p>}
                </form>
              ) : (
                <button
                  onClick={() => setShowPassword(true)}
                  className="mr-5 text-sm text-olive/50 hover:text-olive underline"
                >
                  Change password
                </button>
              )}

              <button onClick={logout} className="mt-4 text-sm text-olive/50 hover:text-olive underline">
                Log out
              </button>
            </div>
          </div>
        )}

        {/* The tracker. A member has their orders above; this is for everyone
            else, and for a member checking an order placed over chat. */}
        <div className="text-center mb-8">
          <Package className="w-12 h-12 text-olive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-olive mb-2">Track Your Order</h1>
          <p className="text-olive/60">Enter your order number to check your order status</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Enter order number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 border border-olive/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive/30 text-olive"
          />
          <button
            type="submit"
            disabled={loading || !orderNumber.trim()}
            className="px-6 py-3 bg-olive text-cream rounded-lg font-semibold hover:bg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Track
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {order && (
          <div className="bg-sage-light/15 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-olive mb-4">Order Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Order Number</span>
                <span className="text-sm font-semibold text-olive">{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Status</span>
                <span className={`text-sm font-semibold ${
                  order.payment_status === "paid" ? "text-sage" :
                  order.payment_status === "failed" ? "text-red-600" :
                  "text-amber-600"
                }`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Total</span>
                <span className="text-sm font-semibold text-olive">RM {Number(order.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-olive/60">Date</span>
                <span className="text-sm text-olive">{day(order.created_at)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <Link href="/shop" className="text-sm text-olive/60 hover:text-olive underline">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
