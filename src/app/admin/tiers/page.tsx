"use client";

import { useEffect, useState } from "react";
import { Crown, Plus, Trash2, Loader2 } from "lucide-react";

interface Tier {
  id: string;
  name: string;
  min_points: number;
  earn_multiplier: number;
  benefits: string | null;
  colour: string | null;
  sort_order: number;
  is_active: boolean;
}

const BLANK = {
  name: "",
  min_points: 0,
  earn_multiplier: 1,
  benefits: "",
  colour: "#2B3A1B",
  sort_order: 0,
  is_active: true,
};

export default function AdminTiers() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, Partial<Tier>>>({});
  const [adding, setAdding] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  // Set when the tiers table is not there yet, so the page says what to do
  // rather than looking like a shop that simply has no tiers.
  const [setupNeeded, setSetupNeeded] = useState(false);

  const say = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  async function load() {
    const res = await fetch("/api/admin/tiers");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTiers(data.tiers || []);
      setSetupNeeded(false);
    } else {
      setSetupNeeded(/schema cache|does not exist|member_tiers/i.test(data.error || ""));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const value = <K extends keyof Tier>(tier: Tier, key: K): Tier[K] =>
    (draft[tier.id]?.[key] ?? tier[key]) as Tier[K];
  const edit = (id: string, key: keyof Tier, v: unknown) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: v } }));

  async function save(tier: Tier) {
    setBusy(tier.id);
    const res = await fetch("/api/admin/tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...tier, ...draft[tier.id] }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return say(data.error || "Could not save");
    setDraft((d) => { const next = { ...d }; delete next[tier.id]; return next; });
    say("Saved");
    load();
  }

  async function create() {
    if (!adding) return;
    setBusy("new");
    const res = await fetch("/api/admin/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adding),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return say(data.error || "Could not add the tier");
    setAdding(null);
    say("Tier added");
    load();
  }

  async function remove(tier: Tier) {
    if (!confirm(`Delete "${tier.name}"?\n\nMembers in this tier move to the one below it. No points are lost.`)) return;
    setBusy(tier.id);
    const res = await fetch(`/api/admin/tiers?id=${tier.id}`, { method: "DELETE" });
    setBusy("");
    if (!res.ok) return say("Could not delete");
    say("Deleted");
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-olive/50">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-olive flex items-center gap-2">
          <Crown className="w-6 h-6" /> Member Tiers
        </h1>
        <p className="text-olive/60 mt-1 text-sm">
          What members climb towards, and what each rung is worth. Tiers are earned on
          points from orders — including orders taken over WhatsApp — so chat customers
          climb at the same rate as the shop&apos;s.
        </p>
      </div>

      {setupNeeded && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 mb-1">
            The tiers table has not been created yet
          </p>
          <p className="text-sm text-amber-800">
            Run the member_tiers migration in Supabase and reload this page. Until then the
            member area simply shows no tiers — nothing else is affected.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {tiers.map((tier) => {
          const touched = Boolean(draft[tier.id]);
          return (
            <div key={tier.id} className="rounded-xl border border-olive/15 p-4 bg-white">
              <div className="flex items-start gap-3 mb-3">
                <input
                  type="color"
                  value={value(tier, "colour") || "#2B3A1B"}
                  onChange={(e) => edit(tier.id, "colour", e.target.value)}
                  className="w-10 h-10 rounded-lg border border-olive/20 cursor-pointer shrink-0"
                  title="Badge colour"
                />
                <input
                  value={value(tier, "name") || ""}
                  onChange={(e) => edit(tier.id, "name", e.target.value)}
                  placeholder="Tier name"
                  className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-olive font-semibold"
                />
                <label className="flex items-center gap-2 text-sm text-olive/70 shrink-0 px-2">
                  <input
                    type="checkbox"
                    checked={Boolean(value(tier, "is_active"))}
                    onChange={(e) => edit(tier.id, "is_active", e.target.checked)}
                  />
                  Live
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="block text-xs font-medium text-olive/60 mb-1">
                    Points needed to reach it
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={value(tier, "min_points") ?? 0}
                    onChange={(e) => edit(tier.id, "min_points", Number(e.target.value))}
                    className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-olive/60 mb-1">
                    Earns points at this rate
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={value(tier, "earn_multiplier") ?? 1}
                    onChange={(e) => edit(tier.id, "earn_multiplier", Number(e.target.value))}
                    className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive"
                  />
                  <span className="block text-xs text-olive/40 mt-1">
                    1 is the ordinary rate, 1.5 earns half again as fast
                  </span>
                </label>
              </div>

              <label className="block mb-3">
                <span className="block text-xs font-medium text-olive/60 mb-1">
                  What this tier gets — one benefit per line, shown to the member
                </span>
                <textarea
                  rows={3}
                  value={value(tier, "benefits") || ""}
                  onChange={(e) => edit(tier.id, "benefits", e.target.value)}
                  placeholder={"Free shipping on every order\nEarly access to new products"}
                  className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive text-sm"
                />
              </label>

              <div className="flex items-center gap-2">
                {touched && (
                  <button
                    onClick={() => save(tier)}
                    disabled={busy === tier.id}
                    className="px-4 py-2 bg-olive text-cream rounded-lg text-sm font-semibold hover:bg-sage-dark disabled:opacity-50"
                  >
                    {busy === tier.id ? "Saving..." : "Save"}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => remove(tier)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-olive/25 p-4 bg-white">
          <div className="flex items-start gap-3 mb-3">
            <input
              type="color"
              value={adding.colour}
              onChange={(e) => setAdding({ ...adding, colour: e.target.value })}
              className="w-10 h-10 rounded-lg border border-olive/20 cursor-pointer shrink-0"
            />
            <input
              autoFocus
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              placeholder="Tier name, e.g. Gold"
              className="flex-1 px-3 py-2 border border-olive/20 rounded-lg text-olive font-semibold"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="block text-xs font-medium text-olive/60 mb-1">Points needed</span>
              <input
                type="number"
                min={0}
                value={adding.min_points}
                onChange={(e) => setAdding({ ...adding, min_points: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-olive/60 mb-1">Earn rate</span>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={adding.earn_multiplier}
                onChange={(e) => setAdding({ ...adding, earn_multiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive"
              />
            </label>
          </div>
          <textarea
            rows={3}
            value={adding.benefits}
            onChange={(e) => setAdding({ ...adding, benefits: e.target.value })}
            placeholder="One benefit per line"
            className="w-full px-3 py-2 border border-olive/20 rounded-lg text-olive text-sm mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === "new"}
              className="px-4 py-2 bg-olive text-cream rounded-lg text-sm font-semibold hover:bg-sage-dark disabled:opacity-50"
            >
              {busy === "new" ? "Adding..." : "Add tier"}
            </button>
            <button onClick={() => setAdding(null)} className="px-4 py-2 text-sm text-olive/60 hover:text-olive">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding({ ...BLANK })}
          className="mt-4 flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-olive/25 rounded-xl text-sm font-medium text-olive/70 hover:border-olive/50 hover:text-olive w-full justify-center"
        >
          <Plus className="w-4 h-4" /> Add a tier
        </button>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-olive text-cream px-4 py-2.5 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
