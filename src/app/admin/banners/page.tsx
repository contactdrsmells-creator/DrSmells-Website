"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/lib/types";
import { sampleBanners } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, Save, X, Upload } from "lucide-react";

export default function AdminBanners() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [editing, setEditing] = useState<Partial<HeroBanner> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here";

  useEffect(() => {
    loadBanners();
  }, []);

  async function loadBanners() {
    if (!isConfigured) {
      setBanners(sampleBanners);
      return;
    }
    const { data } = await supabase.from("hero_banners").select("*").order("sort_order");
    setBanners((data as HeroBanner[]) || []);
  }

  async function handleSave() {
    if (!editing || !isConfigured) {
      alert("Connect Supabase to save changes.");
      return;
    }
    setSaving(true);
    const bannerData = {
      title: editing.title,
      subtitle: editing.subtitle,
      cta_text: editing.cta_text,
      cta_link: editing.cta_link,
      image_url: editing.image_url || null,
      video_url: editing.video_url || null,
      active: editing.active ?? true,
      sort_order: editing.sort_order || 0,
    };

    if (isNew) {
      await supabase.from("hero_banners").insert(bannerData);
    } else {
      await supabase.from("hero_banners").update(bannerData).eq("id", editing.id);
    }
    setSaving(false);
    setEditing(null);
    loadBanners();
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "videos");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setEditing((prev) => prev ? { ...prev, video_url: data.url } : prev);
      } else {
        alert(data.error || "Upload failed");
      }
    } catch {
      alert("Upload failed");
    }
    setUploadingVideo(false);
  }

  async function handleDelete(id: string) {
    if (!isConfigured) return;
    if (!confirm("Delete this banner?")) return;
    await supabase.from("hero_banners").delete().eq("id", id);
    loadBanners();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Hero Banners</h1>
        <button
          onClick={() => {
            setEditing({ title: "", subtitle: "", cta_text: "Shop Now", cta_link: "/shop", active: true, sort_order: 0 });
            setIsNew(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark"
        >
          <Plus className="w-4 h-4" /> Add Banner
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{isNew ? "Add Banner" : "Edit Banner"}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" placeholder="20% OFF" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input type="text" value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                  <input type="text" value={editing.cta_text || ""} onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Link</label>
                  <input type="text" value={editing.cta_link || ""} onChange={(e) => setEditing({ ...editing, cta_link: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="accent-teal" />
                Active
              </label>

              {/* Video Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background Video</label>
                {editing.video_url && (
                  <div className="mb-2">
                    <video src={editing.video_url} className="w-full h-32 object-cover rounded-lg" muted playsInline />
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, video_url: null })}
                      className="text-xs text-red-500 mt-1 hover:underline"
                    >
                      Remove video
                    </button>
                  </div>
                )}
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal text-sm text-gray-500">
                  <Upload className="w-4 h-4" />
                  {uploadingVideo ? "Uploading..." : "Upload video (MP4, max 50MB)"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleVideoUpload}
                    className="hidden"
                    disabled={uploadingVideo}
                  />
                </label>
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
        {banners.map((banner) => (
          <div key={banner.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${banner.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {banner.active ? "Active" : "Inactive"}
              </span>
              <h3 className="font-semibold text-gray-800 mt-1">{banner.title}</h3>
              <p className="text-sm text-gray-500">{banner.subtitle}</p>
              <p className="text-xs text-teal mt-1">{banner.cta_text} → {banner.cta_link}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setEditing({ ...banner }); setIsNew(false); }} className="p-2 text-gray-400 hover:text-teal"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(banner.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
