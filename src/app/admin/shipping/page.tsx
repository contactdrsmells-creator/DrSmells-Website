"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";

interface ShippingZone {
  id: string;
  name: string;
  states: string[];
  flat_rate: number;
  free_shipping_min: number;
}

const ALL_STATES = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka",
  "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
  "Sabah", "Sarawak", "Selangor", "Terengganu",
];

export default function AdminShippingPage() {
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/shipping-settings")
      .then((r) => r.json())
      .then((data) => setZones(data.zones || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/shipping-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert("Failed to save shipping settings");
      }
    } catch {
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    const usedStates = zones.flatMap((z) => z.states);
    const available = ALL_STATES.filter((s) => !usedStates.includes(s));
    setZones([
      ...zones,
      {
        id: `zone-${Date.now()}`,
        name: "New Zone",
        states: available.length > 0 ? [available[0]] : [],
        flat_rate: 10,
        free_shipping_min: 0,
      },
    ]);
  }

  function removeZone(id: string) {
    setZones(zones.filter((z) => z.id !== id));
  }

  function updateZone(id: string, updates: Partial<ShippingZone>) {
    setZones(zones.map((z) => (z.id === id ? { ...z, ...updates } : z)));
  }

  function toggleState(zoneId: string, state: string) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) return;
    const has = zone.states.includes(state);
    updateZone(zoneId, {
      states: has ? zone.states.filter((s) => s !== state) : [...zone.states, state],
    });
  }

  const usedStates = (zoneId: string) => {
    return zones.filter((z) => z.id !== zoneId).flatMap((z) => z.states);
  };

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
          <h1 className="text-2xl font-bold text-gray-800">Shipping Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure shipping zones and rates by state</p>
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
        {zones.map((zone) => {
          const taken = usedStates(zone.id);
          return (
            <div key={zone.id} className="bg-white rounded-xl border p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 mr-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Zone Name</label>
                  <input
                    type="text"
                    value={zone.name}
                    onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
                <button
                  onClick={() => removeZone(zone.id)}
                  className="mt-5 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Flat Rate (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={zone.flat_rate}
                    onChange={(e) => updateZone(zone.id, { flat_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Free Shipping Above (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={zone.free_shipping_min}
                    onChange={(e) => updateZone(zone.id, { free_shipping_min: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-olive/30"
                  />
                  <p className="text-xs text-gray-400 mt-1">Set to 0 to never give free shipping for this zone</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">States in this zone</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_STATES.map((state) => {
                    const inThisZone = zone.states.includes(state);
                    const inOtherZone = taken.includes(state);
                    return (
                      <button
                        key={state}
                        onClick={() => !inOtherZone && toggleState(zone.id, state)}
                        disabled={inOtherZone}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          inThisZone
                            ? "bg-olive text-white"
                            : inOtherZone
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {state}
                      </button>
                    );
                  })}
                </div>
                {zone.states.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">Select at least one state</p>
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={addZone}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-olive hover:text-olive transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Shipping Zone
        </button>
      </div>
    </div>
  );
}
