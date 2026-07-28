"use client";

import { useEffect, useState } from "react";
import { Product, ProductPageSections, ProductVariation, VariationAttribute, VariationCombo, SubscriptionOption } from "@/lib/types";
import { sampleProducts } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2, Save, X, Upload, ChevronDown, ChevronUp, GripVertical, Copy } from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";

// Collapsible panel inside modal
function Panel({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100 pt-3">{children}</div>}
    </div>
  );
}

const ALL_CATEGORIES = ["underarm", "mouth", "feet", "bundle"];

const emptyProduct: Partial<Product> = {
  name: "", slug: "", description: "", short_description: "", price: 0, sale_price: null,
  category: "underarm", categories: [], related_products: [], image_url: "", images: [], sizes: [], variations: [],
  in_stock: true, featured: false, sort_order: 0, page_sections: {},
};

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [varAttrs, setVarAttrs] = useState<VariationAttribute[]>([]);
  const [varCombos, setVarCombos] = useState<VariationCombo[]>([]);
  const [subEnabled, setSubEnabled] = useState(false);
  const [subOptions, setSubOptions] = useState<SubscriptionOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Per-product page sections state
  const [ps, setPs] = useState<ProductPageSections>({});
  const [vpItems, setVpItems] = useState<{ icon: string; title: string; subtitle: string; icon_url?: string; icon_size?: number }[]>([]);
  const [tellFaqs, setTellFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [askFaqs, setAskFaqs] = useState<{ question: string; answer: string }[]>([]);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    if (!isConfigured) { setProducts(sampleProducts); return; }
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts((data as Product[]) || []);
  }

  function startEdit(product: Product) {
    setEditing({
      ...product,
      images: product.images || (product.image_url ? [product.image_url] : []),
      categories: product.categories || (product.category ? [product.category] : []),
      related_products: product.related_products || [],
    });
    setVariations(product.variations || (product.sizes || []).map((s) => ({ name: s, price: product.price, sale_price: product.sale_price })));
    setVarAttrs(product.variation_attributes || []);
    setVarCombos(product.variation_combos || []);
    setSubEnabled(product.subscription_enabled || false);
    setSubOptions(product.subscription_options || []);
    setIsNew(false);
    const sections = (product.page_sections || {}) as ProductPageSections;
    setPs(sections);
    setVpItems(sections.value_props_items || []);
    setTellFaqs(sections.tell_me_more_faqs || []);
    setAskFaqs(sections.ask_us_faqs || []);
  }

  function startNew() {
    setEditing({ ...emptyProduct });
    setVariations([]);
    setVarAttrs([]);
    setVarCombos([]);
    setSubEnabled(false);
    setSubOptions([]);
    setIsNew(true);
    setPs({});
    setVpItems([]);
    setTellFaqs([]);
    setAskFaqs([]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !editing) return;
    setUploading(true);
    const newImgs = [...(editing.images || [])];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) newImgs.push(data.url);
    }
    setEditing({ ...editing, images: newImgs, image_url: newImgs[0] });
    setUploading(false);
    e.target.value = "";
  }

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx || !editing) return;
    const imgs = [...(editing.images || [])];
    const dragged = imgs[dragIdx];
    imgs.splice(dragIdx, 1);
    imgs.splice(idx, 0, dragged);
    setEditing({ ...editing, images: imgs, image_url: imgs[0] });
    setDragIdx(idx);
  }

  function handleDragEnd() {
    setDragIdx(null);
  }

  async function handleSectionFileUpload(field: string, accept: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "product-sections");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) setPs({ ...ps, [field]: data.url });
    e.target.value = "";
  }

  function removeImage(idx: number) {
    if (!editing) return;
    const imgs = [...(editing.images || [])];
    imgs.splice(idx, 1);
    setEditing({ ...editing, images: imgs, image_url: imgs[0] || null });
  }

  async function handleSave() {
    if (!editing || !isConfigured) { alert("Connect Supabase first."); return; }
    setSaving(true);
    const sizes = variations.map((v) => v.name);
    const images = editing.images || [];
    const page_sections = { ...ps, value_props_items: vpItems, tell_me_more_faqs: tellFaqs, ask_us_faqs: askFaqs };
    // Use first variation's price as the base price
    const basePrice = variations.length > 0 ? variations[0].price : (editing.price || 0);
    const baseSalePrice = variations.length > 0 ? (variations[0].sale_price || null) : (editing.sale_price || null);

    const categories = editing.categories || [];
    const productData = {
      name: editing.name, slug: editing.slug, description: editing.description,
      short_description: editing.short_description, price: basePrice,
      sale_price: baseSalePrice, category: categories[0] || "underarm", categories,
      related_products: editing.related_products || [],
      image_url: images[0] || editing.image_url || null, images, sizes, variations,
      variation_attributes: varAttrs.length > 0 ? varAttrs : null,
      variation_combos: varCombos.length > 0 ? varCombos : null,
      subscription_enabled: subEnabled,
      subscription_options: subOptions.length > 0 ? subOptions : null,
      in_stock: editing.in_stock, featured: editing.featured, sort_order: editing.sort_order,
      page_sections,
    };

    let error;
    if (isNew) {
      const res = await supabase.from("products").insert(productData);
      error = res.error;
    } else {
      const res = await supabase.from("products").update(productData).eq("id", editing.id);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      alert(`Save failed: ${error.message}`);
      return;
    }
    setEditing(null);
    showToast("Product saved!");
    loadProducts();
  }

  async function handleDelete(id: string) {
    if (!isConfigured) return;
    if (!confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    showToast("Product deleted");
    loadProducts();
  }

  async function duplicateProduct(product: Product) {
    if (!isConfigured) return;
    const { id, ...rest } = product;
    const dupData = {
      ...rest,
      name: `${product.name} (Copy)`,
      slug: `${product.slug}-copy-${Date.now()}`,
      sort_order: products.length,
    };
    const { error } = await supabase.from("products").insert(dupData);
    if (error) { alert("Failed to duplicate: " + error.message); return; }
    loadProducts();
  }

  async function moveProduct(idx: number, direction: "up" | "down") {
    if (!isConfigured) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= products.length) return;
    const a = products[idx];
    const b = products[swapIdx];
    // Use explicit index-based sort orders to avoid duplicate sort_order issues
    await Promise.all([
      supabase.from("products").update({ sort_order: swapIdx }).eq("id", a.id),
      supabase.from("products").update({ sort_order: idx }).eq("id", b.id),
    ]);
    loadProducts();
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-olive text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <Save className="w-4 h-4" /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Products</h1>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{isNew ? "Add Product" : "Edit Product"}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input type="text" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
                  <input type="text" value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="anti-odour-cream" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
                <RichTextEditor
                  value={editing.description || ""}
                  onChange={(html) => setEditing({ ...editing, description: html })}
                  placeholder="Enter product description with formatting..."
                  rows={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-3">
                  {ALL_CATEGORIES.map((cat) => {
                    const cats = editing.categories || [];
                    const checked = cats.includes(cat);
                    return (
                      <label key={cat} className="flex items-center gap-1.5 text-sm capitalize">
                        <input type="checkbox" checked={checked} className="accent-olive"
                          onChange={() => {
                            const updated = checked ? cats.filter((c) => c !== cat) : [...cats, cat];
                            setEditing({ ...editing, categories: updated, category: updated[0] || "" });
                          }}
                        />
                        {cat}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Variations (Size + Price) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Variations (Size & Price)</label>
                {variations.map((v, idx) => (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <input type="text" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Size name (e.g. 30ml)" value={v.name} onChange={(e) => { const u = [...variations]; u[idx] = { ...u[idx], name: e.target.value }; setVariations(u); }} />
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">RM</span>
                      <input type="number" step="0.01" className="w-28 pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Price" value={v.price || ""} onChange={(e) => { const u = [...variations]; u[idx] = { ...u[idx], price: parseFloat(e.target.value) || 0 }; setVariations(u); }} />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Sale</span>
                      <input type="number" step="0.01" className="w-28 pl-10 pr-2 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Optional" value={v.sale_price || ""} onChange={(e) => { const u = [...variations]; u[idx] = { ...u[idx], sale_price: e.target.value ? parseFloat(e.target.value) : null }; setVariations(u); }} />
                    </div>
                    {subEnabled && (
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-green-500">Sub</span>
                        <input type="number" step="0.01" className="w-28 pl-9 pr-2 py-2 border border-green-200 rounded-lg text-sm bg-green-50/50" placeholder="Sub price" value={v.subscription_price || ""} onChange={(e) => { const u = [...variations]; u[idx] = { ...u[idx], subscription_price: e.target.value ? parseFloat(e.target.value) : null }; setVariations(u); }} />
                      </div>
                    )}
                    <button onClick={() => setVariations(variations.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setVariations([...variations, { name: "", price: 0, sale_price: null }])} className="text-xs text-olive hover:underline">+ Add Variation</button>
              </div>

              {/* Multi-Attribute Variations (e.g., Size + Color) */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                <label className="block text-sm font-medium text-gray-700 mb-1">Multi-Attribute Variations</label>
                <p className="text-xs text-gray-400 mb-3">For products with 2+ selection dropdowns (e.g., Size + Color). Leave empty to use simple variations above.</p>

                {/* Attribute Groups */}
                {varAttrs.map((attr, aIdx) => (
                  <div key={aIdx} className="mb-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex gap-2 items-center mb-2">
                      <input
                        type="text"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                        placeholder="Attribute name (e.g. Size, Color)"
                        value={attr.name}
                        onChange={(e) => {
                          const u = [...varAttrs];
                          u[aIdx] = { ...u[aIdx], name: e.target.value };
                          setVarAttrs(u);
                        }}
                      />
                      <button
                        onClick={() => setVarAttrs(varAttrs.filter((_, i) => i !== aIdx))}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {attr.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1">
                          <input
                            type="text"
                            className="bg-transparent text-xs w-20 outline-none"
                            value={opt}
                            onChange={(e) => {
                              const u = [...varAttrs];
                              const opts = [...u[aIdx].options];
                              opts[oIdx] = e.target.value;
                              u[aIdx] = { ...u[aIdx], options: opts };
                              setVarAttrs(u);
                            }}
                          />
                          <button
                            onClick={() => {
                              const u = [...varAttrs];
                              u[aIdx] = { ...u[aIdx], options: u[aIdx].options.filter((_, i) => i !== oIdx) };
                              setVarAttrs(u);
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const u = [...varAttrs];
                          u[aIdx] = { ...u[aIdx], options: [...u[aIdx].options, ""] };
                          setVarAttrs(u);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        + Option
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setVarAttrs([...varAttrs, { name: "", options: [""] }])}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Add Attribute Group
                  </button>

                  {varAttrs.length >= 2 && varAttrs.every(a => a.name && a.options.length > 0 && a.options.every(o => o)) && (
                    <button
                      onClick={() => {
                        // Auto-generate all combinations
                        const allCombos: VariationCombo[] = [];
                        function generate(attrIdx: number, current: Record<string, string>) {
                          if (attrIdx >= varAttrs.length) {
                            // Check if this combo already exists
                            const exists = varCombos.find(c =>
                              Object.keys(current).every(k => c.selections[k] === current[k])
                            );
                            allCombos.push(exists || { selections: { ...current }, price: 0, sale_price: null, in_stock: true });
                            return;
                          }
                          for (const opt of varAttrs[attrIdx].options) {
                            generate(attrIdx + 1, { ...current, [varAttrs[attrIdx].name]: opt });
                          }
                        }
                        generate(0, {});
                        setVarCombos(allCombos);
                      }}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700"
                    >
                      Generate Combinations
                    </button>
                  )}
                </div>

                {/* Combo Pricing Table */}
                {varCombos.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Combination Pricing ({varCombos.length} combos)
                    </label>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {varCombos.map((combo, cIdx) => (
                        <div key={cIdx} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-100 text-xs">
                          <span className="flex-1 text-gray-700 font-medium truncate">
                            {Object.entries(combo.selections).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                          </span>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">RM</span>
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 pl-7 pr-1 py-1 border border-gray-200 rounded text-xs"
                              placeholder="Price"
                              value={combo.price || ""}
                              onChange={(e) => {
                                const u = [...varCombos];
                                u[cIdx] = { ...u[cIdx], price: parseFloat(e.target.value) || 0 };
                                setVarCombos(u);
                              }}
                            />
                          </div>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Sale</span>
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 pl-8 pr-1 py-1 border border-gray-200 rounded text-xs"
                              placeholder="—"
                              value={combo.sale_price || ""}
                              onChange={(e) => {
                                const u = [...varCombos];
                                u[cIdx] = { ...u[cIdx], sale_price: e.target.value ? parseFloat(e.target.value) : null };
                                setVarCombos(u);
                              }}
                            />
                          </div>
                          {subEnabled && (
                            <div className="relative">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-green-500">Sub</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-20 pl-7 pr-1 py-1 border border-green-200 rounded text-xs bg-green-50/50"
                                placeholder="—"
                                value={combo.subscription_price || ""}
                                onChange={(e) => {
                                  const u = [...varCombos];
                                  u[cIdx] = { ...u[cIdx], subscription_price: e.target.value ? parseFloat(e.target.value) : null };
                                  setVarCombos(u);
                                }}
                              />
                            </div>
                          )}
                          <label className="flex items-center gap-1 text-[10px]">
                            <input
                              type="checkbox"
                              checked={combo.in_stock !== false}
                              onChange={(e) => {
                                const u = [...varCombos];
                                u[cIdx] = { ...u[cIdx], in_stock: e.target.checked };
                                setVarCombos(u);
                              }}
                              className="accent-olive w-3 h-3"
                            />
                            Stock
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Subscription Settings */}
              <div className="border border-green-200 rounded-lg p-4 bg-green-50/30">
                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={subEnabled} onChange={(e) => setSubEnabled(e.target.checked)} className="accent-olive" />
                    Enable Subscription Purchase
                  </label>
                </div>
                {subEnabled && (
                  <div>
                    <p className="text-xs text-gray-400 mb-3">Set which delivery intervals are available. Subscription prices are set per variation above.</p>
                    {subOptions.map((opt, idx) => (
                      <div key={idx} className="flex gap-2 mb-2 items-center">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Every</span>
                          <input type="number" min="1" max="12" className="w-full pl-12 pr-2 py-2 border border-gray-200 rounded-lg text-sm" placeholder="1"
                            value={opt.interval_months || ""}
                            onChange={(e) => { const u = [...subOptions]; u[idx] = { ...u[idx], interval_months: parseInt(e.target.value) || 1 }; setSubOptions(u); }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">month(s)</span>
                        </div>
                        <button onClick={() => setSubOptions(subOptions.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button onClick={() => setSubOptions([...subOptions, { interval_months: subOptions.length + 1 }])} className="text-xs text-olive hover:underline">+ Add Interval</button>
                  </div>
                )}
              </div>

              {/* Multi-image upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Images (first = cover)</label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {(editing.images || []).map((url, idx) => (
                    <div
                      key={idx}
                      className={`relative group cursor-grab active:cursor-grabbing ${dragIdx === idx ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                    >
                      <img src={url} alt="" className={`w-full aspect-square object-cover rounded-lg border-2 ${idx === 0 ? "border-olive" : "border-transparent"}`} />
                      {idx === 0 && <span className="absolute top-1 left-1 bg-olive text-white text-[10px] px-1.5 py-0.5 rounded font-medium">Cover</span>}
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mb-2">Drag images to reorder. First image is the cover.</p>
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-olive text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-sage-dark transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Add Image"}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.in_stock ?? true} onChange={(e) => setEditing({ ...editing, in_stock: e.target.checked })} className="accent-olive" /> In Stock</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.featured ?? false} onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} className="accent-olive" /> Featured</label>
              </div>

              {/* Related Products ("You may also like") */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">You May Also Like (select products)</label>
                <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {products.filter((p) => p.id !== editing.id).map((p) => {
                    const selected = (editing.related_products || []).includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selected} className="accent-olive"
                          onChange={() => {
                            const rp = editing.related_products || [];
                            const updated = selected ? rp.filter((id) => id !== p.id) : [...rp, p.id];
                            setEditing({ ...editing, related_products: updated });
                          }}
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ====== PRODUCT PAGE SECTIONS ====== */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Product Page Sections</p>

                {/* Value Props (Simple . Effective . 100hrs) */}
                <Panel title="Simple . Effective . 100hrs (Value Props)">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Section Heading</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.value_props_heading || ""} onChange={(e) => setPs({ ...ps, value_props_heading: e.target.value })} placeholder="Simple . Effective . 100hrs" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Props (leave empty to use homepage defaults)</label>
                      {vpItems.map((item, idx) => (
                        <div key={idx} className="border border-gray-100 rounded-lg p-2 mb-2">
                          <div className="flex gap-2 mb-1.5">
                            <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Title" value={item.title} onChange={(e) => { const u = [...vpItems]; u[idx] = { ...u[idx], title: e.target.value }; setVpItems(u); }} />
                            <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Subtitle" value={item.subtitle} onChange={(e) => { const u = [...vpItems]; u[idx] = { ...u[idx], subtitle: e.target.value }; setVpItems(u); }} />
                            <button onClick={() => setVpItems(vpItems.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="flex gap-2 items-center">
                            <select className="px-2 py-1 border border-gray-200 rounded text-xs" value={item.icon} onChange={(e) => { const u = [...vpItems]; u[idx] = { ...u[idx], icon: e.target.value }; setVpItems(u); }}>
                              <option value="">No icon</option>
                              <option value="droplets">Droplets</option>
                              <option value="rabbit">Rabbit</option>
                              <option value="stars">Stars</option>
                              <option value="leaf">Leaf</option>
                              <option value="shield">Shield</option>
                              <option value="heart">Heart</option>
                              <option value="award">Award</option>
                              <option value="globe">Globe</option>
                              <option value="malaysia">Malaysia</option>
                            </select>
                            <span className="text-[10px] text-gray-400">or</span>
                            <label className="px-2 py-1 bg-gray-100 rounded text-[10px] cursor-pointer hover:bg-gray-200">
                              Upload icon
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const fd = new FormData(); fd.append("file", file); fd.append("folder", "icons");
                                const res = await fetch("/api/upload", { method: "POST", body: fd });
                                const data = await res.json();
                                if (data.url) { const u = [...vpItems]; u[idx] = { ...u[idx], icon_url: data.url }; setVpItems(u); }
                                e.target.value = "";
                              }} />
                            </label>
                            {item.icon_url && <img src={item.icon_url} alt="" className="w-6 h-6 object-contain" />}
                            <div className="flex items-center gap-1 ml-auto">
                              <span className="text-[10px] text-gray-400">Size:</span>
                              <input type="number" className="w-12 px-1 py-0.5 border border-gray-200 rounded text-xs text-center" value={item.icon_size || 40} onChange={(e) => { const u = [...vpItems]; u[idx] = { ...u[idx], icon_size: parseInt(e.target.value) || 40 }; setVpItems(u); }} />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setVpItems([...vpItems, { icon: "droplets", title: "", subtitle: "", icon_size: 40 }])} className="text-xs text-olive hover:underline">+ Add Prop</button>
                    </div>
                  </div>
                </Panel>

                <div className="mt-2">
                {/* Tell Me More */}
                <Panel title="Tell Me More">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Section Title</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.tell_me_more_title || ""} onChange={(e) => setPs({ ...ps, tell_me_more_title: e.target.value })} placeholder="Tell Me More" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Circle Image (left side)</label>
                      <label className="flex items-center justify-center gap-2 px-3 py-2 bg-olive text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-sage-dark">
                        <Upload className="w-3 h-3" /> {ps.tell_me_more_image ? "Change Image" : "Upload Image"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSectionFileUpload("tell_me_more_image", "image/*", e)} />
                      </label>
                      {ps.tell_me_more_image && (
                        <div className="flex items-center gap-2 mt-2">
                          <img src={ps.tell_me_more_image} alt="" className="w-20 h-20 object-cover rounded-lg" />
                          <button type="button" onClick={() => setPs({ ...ps, tell_me_more_image: "" })} className="text-red-400 hover:text-red-600 text-[10px] font-medium">Remove</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Description</label>
                      <textarea rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" value={ps.tell_me_more_description || ""} onChange={(e) => setPs({ ...ps, tell_me_more_description: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">FAQs</label>
                      {tellFaqs.map((faq, idx) => (
                        <div key={idx} className="flex gap-2 mb-2">
                          <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Question" value={faq.question} onChange={(e) => { const u = [...tellFaqs]; u[idx] = { ...u[idx], question: e.target.value }; setTellFaqs(u); }} />
                          <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Answer" value={faq.answer} onChange={(e) => { const u = [...tellFaqs]; u[idx] = { ...u[idx], answer: e.target.value }; setTellFaqs(u); }} />
                          <button onClick={() => setTellFaqs(tellFaqs.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button onClick={() => setTellFaqs([...tellFaqs, { question: "", answer: "" }])} className="text-xs text-olive hover:underline">+ Add FAQ</button>
                    </div>
                  </div>
                </Panel>
                </div>

                {/* How It Works */}
                <div className="mt-2">
                  <Panel title="How Dr Smells Works? (Video)">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Section Title</label>
                        <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.how_it_works_title || ""} onChange={(e) => setPs({ ...ps, how_it_works_title: e.target.value })} placeholder="How Dr Smells works?" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <textarea rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y" value={ps.how_it_works_description || ""} onChange={(e) => setPs({ ...ps, how_it_works_description: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Upload Video (MP4)</label>
                        <label className="flex items-center justify-center gap-2 px-3 py-2 bg-olive text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-sage-dark">
                          <Upload className="w-3 h-3" /> {ps.how_it_works_video ? "Change Video" : "Upload Video"}
                          <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => handleSectionFileUpload("how_it_works_video", "video/*", e)} />
                        </label>
                        {ps.how_it_works_video && (
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-gray-400 truncate flex-1">{ps.how_it_works_video}</p>
                            <button type="button" onClick={() => setPs({ ...ps, how_it_works_video: "" })} className="text-red-400 hover:text-red-600 text-[10px] font-medium shrink-0">Remove</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Panel>
                </div>

                {/* How To Use */}
                <div className="mt-2">
                  <Panel title="How To Use (Image + Description)">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Image (left side)</label>
                        <label className="flex items-center justify-center gap-2 px-3 py-2 bg-olive text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-sage-dark">
                          <Upload className="w-3 h-3" /> {ps.how_to_use_image ? "Change Image" : "Upload Image"}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSectionFileUpload("how_to_use_image", "image/*", e)} />
                        </label>
                        {ps.how_to_use_image && (
                          <div className="flex items-center gap-2 mt-2">
                            <img src={ps.how_to_use_image} alt="" className="w-full h-32 object-cover rounded-lg flex-1" />
                            <button type="button" onClick={() => setPs({ ...ps, how_to_use_image: "" })} className="text-red-400 hover:text-red-600 text-[10px] font-medium shrink-0">Remove</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Description (right side)</label>
                        <textarea rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" value={ps.how_to_use_description || ""} onChange={(e) => setPs({ ...ps, how_to_use_description: e.target.value })} placeholder="Step-by-step usage instructions..." />
                      </div>
                    </div>
                  </Panel>
                </div>

                {/* Ask Us Anything */}
                <div className="mt-2">
                  <Panel title="Ask Us Anything">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Title</label>
                          <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.ask_us_title || ""} onChange={(e) => setPs({ ...ps, ask_us_title: e.target.value })} placeholder="Ask Us Anything" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
                          <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.ask_us_subtitle || ""} onChange={(e) => setPs({ ...ps, ask_us_subtitle: e.target.value })} placeholder="Still Curious?" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">FAQ Page Button URL</label>
                          <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.ask_us_faq_link || ""} onChange={(e) => setPs({ ...ps, ask_us_faq_link: e.target.value })} placeholder="/faq" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Contact Button URL</label>
                          <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={ps.ask_us_contact_link || ""} onChange={(e) => setPs({ ...ps, ask_us_contact_link: e.target.value })} placeholder="/contact" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-2">FAQs</label>
                        {askFaqs.map((faq, idx) => (
                          <div key={idx} className="flex gap-2 mb-2">
                            <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Question" value={faq.question} onChange={(e) => { const u = [...askFaqs]; u[idx] = { ...u[idx], question: e.target.value }; setAskFaqs(u); }} />
                            <input className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="Answer" value={faq.answer} onChange={(e) => { const u = [...askFaqs]; u[idx] = { ...u[idx], answer: e.target.value }; setAskFaqs(u); }} />
                            <button onClick={() => setAskFaqs(askFaqs.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                        <button onClick={() => setAskFaqs([...askFaqs, { question: "", answer: "" }])} className="text-xs text-olive hover:underline">+ Add FAQ</button>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-olive text-white rounded-lg text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Product"}
              </button>
              <button onClick={() => setEditing(null)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-2 py-3"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Price</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((product, idx) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-2 py-3">
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={() => moveProduct(idx, "up")} disabled={idx === 0} className="p-0.5 text-gray-300 hover:text-olive disabled:opacity-20 disabled:cursor-not-allowed"><ChevronUp className="w-4 h-4" /></button>
                    <button onClick={() => moveProduct(idx, "down")} disabled={idx === products.length - 1} className="p-0.5 text-gray-300 hover:text-olive disabled:opacity-20 disabled:cursor-not-allowed"><ChevronDown className="w-4 h-4" /></button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sage-light rounded-lg flex items-center justify-center text-olive text-xs font-bold flex-shrink-0 overflow-hidden">
                      {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover rounded-lg" /> : "DS"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.images?.length || 0} images · {(product.variations || []).map((v) => v.name).join(", ") || product.sizes?.join(", ") || "No sizes"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(product.categories || [product.category]).map((cat) => (
                      <span key={cat} className="text-xs px-2 py-0.5 bg-gray-100 rounded-full capitalize">{cat}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    // Bundles price entirely through variation_combos and never use
                    // the base price, so showing product.price here listed every
                    // bundle at RM49.90 regardless of what it actually sells for.
                    // Mirrors how the storefront displays a range.
                    const comboPrices = (product.variation_combos || []).map((c) => c.sale_price ?? c.price);
                    if (comboPrices.length > 0) {
                      const min = Math.min(...comboPrices);
                      const max = Math.max(...comboPrices);
                      return (
                        <span className="text-sm font-medium">
                          {min === max ? `RM ${min.toFixed(2)}` : `RM ${min.toFixed(2)} – RM ${max.toFixed(2)}`}
                        </span>
                      );
                    }

                    const variationPrices = (product.variations || []).map((v) => v.sale_price ?? v.price);
                    if (variationPrices.length > 0) {
                      const min = Math.min(...variationPrices);
                      const max = Math.max(...variationPrices);
                      return (
                        <span className="text-sm font-medium">
                          {min === max ? `RM ${min.toFixed(2)}` : `RM ${min.toFixed(2)} – RM ${max.toFixed(2)}`}
                        </span>
                      );
                    }

                    return (
                      <>
                        <span className="text-sm font-medium">RM {product.price.toFixed(2)}</span>
                        {product.sale_price && <span className="text-xs text-red-500 ml-1">(RM {product.sale_price.toFixed(2)})</span>}
                      </>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${product.in_stock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {product.in_stock ? "In Stock" : "Out of Stock"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => startEdit(product)} className="p-1.5 text-gray-400 hover:text-olive transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => duplicateProduct(product)} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors" title="Duplicate"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(product.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
