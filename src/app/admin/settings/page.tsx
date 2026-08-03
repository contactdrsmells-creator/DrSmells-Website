"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Save } from "lucide-react";
import { upsertSetting } from "@/lib/admin-content";

interface Settings {
  brand: { name: string; tagline: string; mission: string; company: string };
  contact: { email: string; phone: string; whatsapp: string; address: string };
  social: { facebook: string; instagram: string; tiktok: string; whatsapp: string };
}

const defaultSettings: Settings = {
  brand: { name: "Dr.Smells", tagline: "Simple . Effective . 100hrs", mission: "Your skin, our mission - smell like you", company: "LIFE BIO LAB SDN. BHD (1452572-P)" },
  contact: { email: "info@drsmells.com.my", phone: "", whatsapp: "", address: "" },
  social: { facebook: "", instagram: "", tiktok: "", whatsapp: "" },
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here";

  useEffect(() => {
    async function load() {
      if (!isConfigured) return;
      const { data } = await supabase.from("site_settings").select("*");
      if (data) {
        const s = { ...defaultSettings };
        data.forEach((row: { key: string; value: Record<string, string> }) => {
          if (row.key in s) {
            (s as Record<string, Record<string, string>>)[row.key] = row.value;
          }
        });
        setSettings(s);
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!isConfigured) {
      alert("Connect Supabase to save settings.");
      return;
    }
    setSaving(true);
    for (const [key, value] of Object.entries(settings)) {
      { const { error } = await upsertSetting(key, value); if (error) alert(error.message); }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateField(section: keyof Settings, field: string, value: string) {
    setSettings({
      ...settings,
      [section]: { ...settings[section], [field]: value },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Site Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <div className="space-y-6">
        {/* Brand Settings */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Brand</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
              <input type="text" value={settings.brand.name} onChange={(e) => updateField("brand", "name", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
              <input type="text" value={settings.brand.tagline} onChange={(e) => updateField("brand", "tagline", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mission / Subtitle</label>
              <input type="text" value={settings.brand.mission || ""} onChange={(e) => updateField("brand", "mission", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input type="text" value={settings.brand.company} onChange={(e) => updateField("brand", "company", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
          </div>
        </div>

        {/* Contact Settings */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={settings.contact.email} onChange={(e) => updateField("contact", "email", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={settings.contact.phone} onChange={(e) => updateField("contact", "phone", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" value={settings.contact.whatsapp} onChange={(e) => updateField("contact", "whatsapp", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={settings.contact.address} onChange={(e) => updateField("contact", "address", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" />
            </div>
          </div>
        </div>

        {/* Social Media */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Social Media</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook URL</label>
              <input type="url" value={settings.social.facebook} onChange={(e) => updateField("social", "facebook", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" placeholder="https://facebook.com/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram URL</label>
              <input type="url" value={settings.social.instagram} onChange={(e) => updateField("social", "instagram", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" placeholder="https://instagram.com/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TikTok URL</label>
              <input type="url" value={settings.social.tiktok} onChange={(e) => updateField("social", "tiktok", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" placeholder="https://tiktok.com/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Link</label>
              <input type="url" value={settings.social.whatsapp} onChange={(e) => updateField("social", "whatsapp", e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/50" placeholder="https://wa.me/..." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
