"use client";

import { useEffect, useState } from "react";
import { FAQ } from "@/lib/types";
import { sampleFAQs } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";

export default function AdminFAQs() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [editing, setEditing] = useState<Partial<FAQ> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here";

  useEffect(() => { load(); }, []);

  async function load() {
    if (!isConfigured) { setFaqs(sampleFAQs); return; }
    const { data } = await supabase.from("faqs").select("*").order("sort_order");
    setFaqs((data as FAQ[]) || []);
  }

  async function handleSave() {
    if (!editing || !isConfigured) { alert("Connect Supabase to save."); return; }
    setSaving(true);
    const d = { question: editing.question, answer: editing.answer, sort_order: editing.sort_order || 0 };
    if (isNew) await supabase.from("faqs").insert(d);
    else await supabase.from("faqs").update(d).eq("id", editing.id);
    setSaving(false); setEditing(null); load();
  }

  async function handleDelete(id: string) {
    if (!isConfigured) return;
    if (!confirm("Delete this FAQ?")) return;
    await supabase.from("faqs").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">FAQs</h1>
        <button onClick={() => { setEditing({ question: "", answer: "", sort_order: 0 }); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark">
          <Plus className="w-4 h-4" /> Add FAQ
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{isNew ? "Add FAQ" : "Edit FAQ"}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                <input type="text" value={editing.question || ""} onChange={(e) => setEditing({ ...editing, question: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
                <textarea rows={4} value={editing.answer || ""} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" value={editing.sort_order || 0} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
              </div>
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
        {faqs.map((faq) => (
          <div key={faq.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800 text-sm">{faq.question}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{faq.answer}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0 ml-4">
              <button onClick={() => { setEditing({ ...faq }); setIsNew(false); }} className="p-2 text-gray-400 hover:text-teal"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(faq.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
