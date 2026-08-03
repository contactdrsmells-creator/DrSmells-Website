"use client";

import { useEffect, useState } from "react";
import { Testimonial } from "@/lib/types";
import { sampleTestimonials } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, Save, X, Star } from "lucide-react";
import { createRecord, deleteRecord, updateRecord } from "@/lib/admin-content";

export default function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [editing, setEditing] = useState<Partial<Testimonial> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here";

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!isConfigured) { setTestimonials(sampleTestimonials); return; }
    const { data } = await supabase.from("testimonials").select("*").order("created_at", { ascending: false });
    setTestimonials((data as Testimonial[]) || []);
  }

  async function handleSave() {
    if (!editing || !isConfigured) { alert("Connect Supabase to save."); return; }
    setSaving(true);
    const d = { name: editing.name, rating: editing.rating || 5, review: editing.review, verified: editing.verified ?? true };
    if (isNew) { const { error } = await createRecord("testimonials", d); if (error) alert(error.message); }
    else { const { error } = await updateRecord("testimonials", editing.id, d); if (error) alert(error.message); }
    setSaving(false); setEditing(null); load();
  }

  async function handleDelete(id: string) {
    if (!isConfigured) return;
    if (!confirm("Delete this testimonial?")) return;
    { const { error } = await deleteRecord("testimonials", id); if (error) alert(error.message); }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Testimonials</h1>
        <button onClick={() => { setEditing({ name: "", review: "", rating: 5, verified: true }); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark">
          <Plus className="w-4 h-4" /> Add Testimonial
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{isNew ? "Add Testimonial" : "Edit Testimonial"}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                <input type="text" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setEditing({ ...editing, rating: n })}>
                      <Star className={`w-6 h-6 ${n <= (editing.rating || 5) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Review</label>
                <textarea rows={4} value={editing.review || ""} onChange={(e) => setEditing({ ...editing, review: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 resize-none" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.verified ?? true} onChange={(e) => setEditing({ ...editing, verified: e.target.checked })} className="accent-teal" />
                Verified Purchaser
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {testimonials.map((t) => (
          <div key={t.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start justify-between">
            <div>
              <div className="flex gap-0.5 mb-1">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-gray-600 mb-2">&ldquo;{t.review}&rdquo;</p>
              <p className="text-xs font-medium text-gray-800">- {t.name} {t.verified && <span className="text-green-600">(Verified)</span>}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0 ml-4">
              <button onClick={() => { setEditing({ ...t }); setIsNew(false); }} className="p-2 text-gray-400 hover:text-teal"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(t.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
