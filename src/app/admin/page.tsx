"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Save,
  Upload,
  Check,
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import { createRecord, deleteRecord, updateRecord, upsertSetting } from "@/lib/admin-content";

// ============================================================
// Types
// ============================================================
interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price: number;
  sale_price: number | null;
  category: string;
  image_url: string | null;
  images: string[];
  sizes: string[];
  in_stock: boolean;
  featured: boolean;
  sort_order: number;
}

interface Testimonial {
  id: string;
  name: string;
  rating: number;
  review: string;
  verified: boolean;
  visible: boolean;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  visible: boolean;
}

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  video_url: string | null;
  active: boolean;
}

// ============================================================
// Helper: Image Upload Button
// ============================================================
function ImageUploader({
  currentUrl,
  onUploaded,
  folder,
}: {
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  folder: string;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (data.url) onUploaded(data.url);
    setUploading(false);
  }

  return (
    <div>
      {currentUrl && (
        <img src={currentUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-2" />
      )}
      <label className="flex items-center justify-center gap-2 px-3 py-2 bg-olive text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-sage-dark transition-colors">
        <Upload className="w-3 h-3" />
        {uploading ? "Uploading..." : currentUrl ? "Change Image" : "Upload Image"}
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  );
}

// ============================================================
// Helper: Video Upload Button
// ============================================================
function VideoUploader({
  currentUrl,
  onUploaded,
  onRemove,
}: {
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "videos");

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (data.url) onUploaded(data.url);
    else alert(data.error || "Upload failed");
    setUploading(false);
  }

  return (
    <div>
      {currentUrl && (
        <div className="mb-2">
          <video src={currentUrl} className="w-full h-32 object-cover rounded-lg" muted playsInline />
          <button type="button" onClick={onRemove} className="text-xs text-red-500 mt-1 hover:underline">
            Remove video
          </button>
        </div>
      )}
      <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 cursor-pointer hover:border-olive transition-colors">
        <Upload className="w-3 h-3" />
        {uploading ? "Uploading..." : currentUrl ? "Change Video" : "Upload Video (MP4, max 50MB)"}
        <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  );
}

// ============================================================
// Helper: Collapsible Section
// ============================================================
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
      >
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function AdminDashboard() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [editingTestimonial, setEditingTestimonial] = useState<Partial<Testimonial> | null>(null);
  const [editingFaq, setEditingFaq] = useState<Partial<FAQ> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [isNewTestimonial, setIsNewTestimonial] = useState(false);
  const [isNewFaq, setIsNewFaq] = useState(false);
  const [sizesInput, setSizesInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [valuePropsHeading, setValuePropsHeading] = useState("Simple . Effective . 100hrs");
  const [valueProps, setValueProps] = useState([
    { icon: "droplets", title: "Dermatologically Tested", subtitle: "Natural Formulated-Ingredients", icon_url: "", icon_size: 40 },
    { icon: "rabbit", title: "Cruelty Free. Vegan Friendly", subtitle: "Nature", icon_url: "", icon_size: 40 },
    { icon: "stars", title: "Trusted Review", subtitle: "Joyful Customers", icon_url: "", icon_size: 40 },
    { icon: "malaysia", title: "Born in Malaysia", subtitle: "Product Crafted in Malaysia", icon_url: "", icon_size: 40 },
  ]);

  const isConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Load all data
  useEffect(() => {
    if (!isConfigured) return;
    loadAll();
  }, []);

  async function loadAll() {
    const [p, t, f, b, s] = await Promise.all([
      supabase.from("products").select("*").order("sort_order"),
      supabase.from("testimonials").select("*").order("created_at"),
      supabase.from("faqs").select("*").order("sort_order"),
      supabase.from("hero_banners").select("*").order("sort_order"),
      supabase.from("site_settings").select("*").eq("key", "site_images"),
    ]);
    if (p.data) setProducts(p.data as Product[]);
    if (t.data) setTestimonials(t.data as Testimonial[]);
    if (f.data) setFaqs(f.data as FAQ[]);
    if (b.data) setBanners(b.data as Banner[]);
    if (s.data?.[0]) {
      const imgs = s.data[0].value as Record<string, string>;
      setSiteImages(imgs);
      if (imgs.value_props_heading) setValuePropsHeading(imgs.value_props_heading);
      if (imgs.value_props) {
        try { setValueProps(JSON.parse(imgs.value_props)); } catch {}
      }
    }
  }

  // ============================================================
  // Site Images (collage)
  // ============================================================
  async function saveSiteImage(key: string, url: string) {
    const updated = { ...siteImages, [key]: url };
    setSiteImages(updated);

    const { error } = await upsertSetting("site_images", updated);

    if (!error) showToast(`Image saved!`);
  }

  // ============================================================
  // Products CRUD
  // ============================================================
  async function saveProduct() {
    if (!editingProduct) return;
    setSaving("product");
    const sizes = sizesInput.split(",").map((s) => s.trim()).filter(Boolean);
    const images = editingProduct.images || [];
    const data = {
      name: editingProduct.name,
      slug: editingProduct.slug,
      description: editingProduct.description,
      short_description: editingProduct.short_description,
      price: editingProduct.price,
      sale_price: editingProduct.sale_price || null,
      category: editingProduct.category,
      image_url: images[0] || editingProduct.image_url || null,
      images,
      sizes,
      in_stock: editingProduct.in_stock ?? true,
      featured: editingProduct.featured ?? false,
      sort_order: editingProduct.sort_order ?? 0,
    };

    if (isNewProduct) {
      { const { error } = await createRecord("products", data); if (error) alert(error.message); }
    } else {
      { const { error } = await updateRecord("products", editingProduct.id, data); if (error) alert(error.message); }
    }
    setSaving(null);
    setEditingProduct(null);
    showToast("Product saved!");
    loadAll();
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    { const { error } = await deleteRecord("products", id); if (error) alert(error.message); }
    showToast("Product deleted");
    loadAll();
  }

  // ============================================================
  // Testimonials CRUD
  // ============================================================
  async function saveTestimonial() {
    if (!editingTestimonial) return;
    setSaving("testimonial");
    const data = {
      name: editingTestimonial.name,
      rating: editingTestimonial.rating ?? 5,
      review: editingTestimonial.review,
      verified: editingTestimonial.verified ?? true,
      visible: editingTestimonial.visible ?? true,
    };

    if (isNewTestimonial) {
      { const { error } = await createRecord("testimonials", data); if (error) alert(error.message); }
    } else {
      { const { error } = await updateRecord("testimonials", editingTestimonial.id, data); if (error) alert(error.message); }
    }
    setSaving(null);
    setEditingTestimonial(null);
    showToast("Testimonial saved!");
    loadAll();
  }

  async function deleteTestimonial(id: string) {
    if (!confirm("Delete this testimonial?")) return;
    { const { error } = await deleteRecord("testimonials", id); if (error) alert(error.message); }
    showToast("Testimonial deleted");
    loadAll();
  }

  // ============================================================
  // FAQs CRUD
  // ============================================================
  async function saveFaq() {
    if (!editingFaq) return;
    setSaving("faq");
    const data = {
      question: editingFaq.question,
      answer: editingFaq.answer,
      sort_order: editingFaq.sort_order ?? 0,
      visible: editingFaq.visible ?? true,
    };

    if (isNewFaq) {
      { const { error } = await createRecord("faqs", data); if (error) alert(error.message); }
    } else {
      { const { error } = await updateRecord("faqs", editingFaq.id, data); if (error) alert(error.message); }
    }
    setSaving(null);
    setEditingFaq(null);
    showToast("FAQ saved!");
    loadAll();
  }

  async function deleteFaq(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    { const { error } = await deleteRecord("faqs", id); if (error) alert(error.message); }
    showToast("FAQ deleted");
    loadAll();
  }

  // ============================================================
  // Banner
  // ============================================================
  async function saveBanner(banner: Banner) {
    setSaving("banner");
    { const { error } = await updateRecord("hero_banners", banner.id, {
      title: banner.title,
      subtitle: banner.subtitle,
      cta_text: banner.cta_text,
      cta_link: banner.cta_link,
      video_url: banner.video_url,
    }); if (error) alert(error.message); }
    setSaving(null);
    showToast("Banner saved!");
  }

  // ============================================================
  // Not configured
  // ============================================================
  if (!isConfigured) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Connect Supabase</h1>
        <p className="text-gray-500">Update your <code>.env.local</code> with your Supabase URL and anon key, then restart the dev server.</p>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-800">Website Editor</h1>
      <p className="text-sm text-gray-500 -mt-4">Edit all website sections from this single page.</p>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-olive text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* ============================================================ */}
      {/* Hero Banner */}
      {/* ============================================================ */}
      <Section title="Hero Banner">
        {banners.map((b) => (
          <div key={b.id} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Badge Text</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={b.title}
                onChange={(e) => setBanners(banners.map((x) => x.id === b.id ? { ...x, title: e.target.value } : x))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Main Heading</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={b.subtitle || ""}
                onChange={(e) => setBanners(banners.map((x) => x.id === b.id ? { ...x, subtitle: e.target.value } : x))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={b.cta_text}
                onChange={(e) => setBanners(banners.map((x) => x.id === b.id ? { ...x, cta_text: e.target.value } : x))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={b.cta_link}
                onChange={(e) => setBanners(banners.map((x) => x.id === b.id ? { ...x, cta_link: e.target.value } : x))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Background Video</label>
              <VideoUploader
                currentUrl={b.video_url}
                onUploaded={(url) => setBanners(banners.map((x) => x.id === b.id ? { ...x, video_url: url } : x))}
                onRemove={() => setBanners(banners.map((x) => x.id === b.id ? { ...x, video_url: null } : x))}
              />
            </div>
            <div className="col-span-2">
              <button onClick={() => saveBanner(b)} className="px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark">
                <Save className="w-4 h-4 inline mr-1" /> Save Banner
              </button>
            </div>
          </div>
        ))}
      </Section>

      {/* ============================================================ */}
      {/* Homepage Collage Images */}
      {/* ============================================================ */}
      <Section title="&lsquo;How Our Products Different&rsquo; Section Image">
        <p className="text-sm text-gray-500 mb-4">This image appears next to the product description on the homepage.</p>
        <div className="max-w-sm">
          <ImageUploader
            currentUrl={siteImages["section_image"]}
            onUploaded={(url) => saveSiteImage("section_image", url)}
            folder="images"
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Value Propositions */}
      {/* ============================================================ */}
      <Section title="Value Propositions (Icons Section)" defaultOpen={false}>
        <p className="text-sm text-gray-500 mb-4">Edit the &ldquo;Simple . Effective . 100hrs&rdquo; section heading and the 4 icon cards below it.</p>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Section Heading</label>
          <input
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            value={valuePropsHeading}
            onChange={(e) => setValuePropsHeading(e.target.value)}
          />
        </div>
        <div className="space-y-4">
          {valueProps.map((prop, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Card {idx + 1}</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={prop.title}
                    onChange={(e) => {
                      const updated = [...valueProps];
                      updated[idx] = { ...updated[idx], title: e.target.value };
                      setValueProps(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={prop.subtitle}
                    onChange={(e) => {
                      const updated = [...valueProps];
                      updated[idx] = { ...updated[idx], subtitle: e.target.value };
                      setValueProps(updated);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Built-in Icon</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={prop.icon}
                    onChange={(e) => {
                      const updated = [...valueProps];
                      updated[idx] = { ...updated[idx], icon: e.target.value };
                      setValueProps(updated);
                    }}
                  >
                    <option value="droplets">Droplets</option>
                    <option value="rabbit">Rabbit (Cruelty-free)</option>
                    <option value="stars">Stars</option>
                    <option value="malaysia">Malaysia Map</option>
                    <option value="leaf">Leaf</option>
                    <option value="shield">Shield</option>
                    <option value="heart">Heart</option>
                    <option value="award">Award</option>
                    <option value="globe">Globe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Or Upload Custom Icon</label>
                  <ImageUploader
                    currentUrl={prop.icon_url || undefined}
                    onUploaded={(url) => {
                      const updated = [...valueProps];
                      updated[idx] = { ...updated[idx], icon_url: url };
                      setValueProps(updated);
                    }}
                    folder="icons"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Icon Size: {prop.icon_size || 40}px</label>
                <input
                  type="range"
                  min={20}
                  max={80}
                  value={prop.icon_size || 40}
                  onChange={(e) => {
                    const updated = [...valueProps];
                    updated[idx] = { ...updated[idx], icon_size: parseInt(e.target.value) };
                    setValueProps(updated);
                  }}
                  className="w-full accent-olive"
                />
              </div>
              {prop.icon_url && (
                <button
                  onClick={() => {
                    const updated = [...valueProps];
                    updated[idx] = { ...updated[idx], icon_url: "" };
                    setValueProps(updated);
                  }}
                  className="text-xs text-red-500 mt-2 hover:underline"
                >
                  Remove custom icon (use built-in)
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={async () => {
            const updated = { ...siteImages, value_props_heading: valuePropsHeading, value_props: JSON.stringify(valueProps) };
            setSiteImages(updated);
            { const { error } = await upsertSetting("site_images", updated); if (error) alert(error.message); }
            showToast("Value propositions saved!");
          }}
          className="mt-4 px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark"
        >
          <Save className="w-4 h-4 inline mr-1" /> Save Value Props
        </button>
      </Section>

      {/* ============================================================ */}
      {/* Products */}
      {/* ============================================================ */}
      <Section title={`Products (${products.length})`}>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
              setEditingProduct({ name: "", slug: "", description: "", short_description: "", price: 0, sale_price: null, category: "underarm", image_url: "", images: [], sizes: [], in_stock: true, featured: false, sort_order: 0 });
              setSizesInput("");
              setIsNewProduct(true);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>

        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg">
              <div className="w-14 h-14 bg-gray-50 rounded-lg flex-shrink-0 overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">IMG</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.category} · RM {p.price} {p.sale_price ? `→ RM ${p.sale_price}` : ""}</p>
              </div>
              <button onClick={() => { setEditingProduct({ ...p }); setSizesInput(p.sizes.join(", ")); setIsNewProduct(false); }} className="p-2 text-gray-400 hover:text-olive"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteProduct(p.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Testimonials */}
      {/* ============================================================ */}
      <Section title={`Testimonials (${testimonials.length})`} defaultOpen={false}>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { setEditingTestimonial({ name: "", rating: 5, review: "", verified: true, visible: true }); setIsNewTestimonial(true); }}
            className="flex items-center gap-1 px-3 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark"
          >
            <Plus className="w-4 h-4" /> Add Testimonial
          </button>
        </div>
        <div className="space-y-2">
          {testimonials.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{t.name} <span className="text-yellow-500">{"★".repeat(t.rating)}</span></p>
                <p className="text-xs text-gray-500 truncate">{t.review}</p>
              </div>
              <button onClick={() => { setEditingTestimonial({ ...t }); setIsNewTestimonial(false); }} className="p-2 text-gray-400 hover:text-olive"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteTestimonial(t.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/* FAQs */}
      {/* ============================================================ */}
      <Section title={`FAQs (${faqs.length})`} defaultOpen={false}>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { setEditingFaq({ question: "", answer: "", sort_order: 0, visible: true }); setIsNewFaq(true); }}
            className="flex items-center gap-1 px-3 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark"
          >
            <Plus className="w-4 h-4" /> Add FAQ
          </button>
        </div>
        <div className="space-y-2">
          {faqs.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{f.question}</p>
                <p className="text-xs text-gray-500 truncate">{f.answer}</p>
              </div>
              <button onClick={() => { setEditingFaq({ ...f }); setIsNewFaq(false); }} className="p-2 text-gray-400 hover:text-olive"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteFaq(f.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Product Edit Modal */}
      {/* ============================================================ */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingProduct(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{isNewProduct ? "Add Product" : "Edit Product"}</h2>
              <button onClick={() => setEditingProduct(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingProduct.name || ""} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Slug (URL)</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingProduct.slug || ""} onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })} placeholder="anti-odour-cream" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Description</label>
                <RichTextEditor
                  value={editingProduct.description || ""}
                  onChange={(html) => setEditingProduct({ ...editingProduct, description: html })}
                  placeholder="Enter product description with formatting..."
                  rows={6}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price (RM)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingProduct.price || 0} onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sale Price (RM)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingProduct.sale_price || ""} onChange={(e) => setEditingProduct({ ...editingProduct, sale_price: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Leave empty" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingProduct.category || "underarm"} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}>
                    <option value="underarm">Underarm</option>
                    <option value="mouth">Mouth</option>
                    <option value="feet">Feet</option>
                    <option value="bundle">Bundle</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sizes (comma separated)</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={sizesInput} onChange={(e) => setSizesInput(e.target.value)} placeholder="30ml, 50ml, 100ml" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Images (first image = cover photo)</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {(editingProduct.images || []).map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img src={url} alt="" className={`w-full aspect-square object-cover rounded-lg ${idx === 0 ? "ring-2 ring-olive" : ""}`} />
                      {idx === 0 && <span className="absolute top-1 left-1 bg-olive text-white text-[10px] px-1.5 py-0.5 rounded">Cover</span>}
                      <button
                        type="button"
                        onClick={() => {
                          const imgs = [...(editingProduct.images || [])];
                          imgs.splice(idx, 1);
                          setEditingProduct({ ...editingProduct, images: imgs, image_url: imgs[0] || null });
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <ImageUploader
                  onUploaded={(url) => {
                    const imgs = [...(editingProduct.images || []), url];
                    setEditingProduct({ ...editingProduct, images: imgs, image_url: imgs[0] });
                  }}
                  folder="products"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingProduct.in_stock ?? true} onChange={(e) => setEditingProduct({ ...editingProduct, in_stock: e.target.checked })} className="accent-olive" /> In Stock
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editingProduct.featured ?? false} onChange={(e) => setEditingProduct({ ...editingProduct, featured: e.target.checked })} className="accent-olive" /> Featured
                </label>
                <div>
                  <label className="text-xs text-gray-600 mr-1">Sort:</label>
                  <input type="number" className="w-16 px-2 py-1 border border-gray-200 rounded text-sm" value={editingProduct.sort_order ?? 0} onChange={(e) => setEditingProduct({ ...editingProduct, sort_order: parseInt(e.target.value) })} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveProduct} disabled={saving === "product"} className="flex-1 py-2.5 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
                {saving === "product" ? "Saving..." : "Save Product"}
              </button>
              <button onClick={() => setEditingProduct(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Testimonial Edit Modal */}
      {/* ============================================================ */}
      {editingTestimonial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingTestimonial(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{isNewTestimonial ? "Add" : "Edit"} Testimonial</h2>
              <button onClick={() => setEditingTestimonial(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingTestimonial.name || ""} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rating (1-5)</label>
                <input type="number" min={1} max={5} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingTestimonial.rating || 5} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, rating: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Review</label>
                <textarea rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" value={editingTestimonial.review || ""} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, review: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveTestimonial} disabled={saving === "testimonial"} className="flex-1 py-2.5 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
                {saving === "testimonial" ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditingTestimonial(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FAQ Edit Modal */}
      {/* ============================================================ */}
      {editingFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingFaq(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{isNewFaq ? "Add" : "Edit"} FAQ</h2>
              <button onClick={() => setEditingFaq(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Question</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingFaq.question || ""} onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Answer</label>
                <textarea rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" value={editingFaq.answer || ""} onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={editingFaq.sort_order || 0} onChange={(e) => setEditingFaq({ ...editingFaq, sort_order: parseInt(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveFaq} disabled={saving === "faq"} className="flex-1 py-2.5 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark disabled:opacity-50">
                {saving === "faq" ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditingFaq(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
