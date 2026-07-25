"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Check, X, Image as ImageIcon, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface UploadedImage {
  url: string;
  fileName: string;
  folder: string;
}

const imageSlots = [
  {
    id: "collage-product",
    label: "Product Collage (Main)",
    desc: "Large product image for the homepage collage section",
    folder: "images",
    target: "collage-product",
  },
  {
    id: "collage-face",
    label: "Model Face (Collage)",
    desc: "Model face closeup for homepage collage",
    folder: "images",
    target: "collage-face",
  },
  {
    id: "collage-skin",
    label: "Skin Shot (Collage)",
    desc: "Shoulder/skin image for homepage collage",
    folder: "images",
    target: "collage-skin",
  },
  {
    id: "collage-shoulder",
    label: "Shoulder (Collage)",
    desc: "Small top image for homepage collage",
    folder: "images",
    target: "collage-shoulder",
  },
];

export default function AdminImages() {
  const [uploads, setUploads] = useState<Record<string, UploadedImage>>({});
  const [productUploads, setProductUploads] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isConfigured =
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Load existing site images on mount
  useEffect(() => {
    if (!isConfigured) return;
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "site_images")
      .single()
      .then(({ data }) => {
        if (data?.value) {
          setSiteImages(data.value as Record<string, string>);
        }
      });
  }, []);

  async function saveSiteImages(updated: Record<string, string>) {
    if (!isConfigured) return;
    setSiteImages(updated);
    await supabase
      .from("site_settings")
      .upsert({ key: "site_images", value: updated, updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  async function handleUpload(file: File, folder: string, slotId?: string) {
    setError(null);
    setUploading(slotId || "products");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Upload failed");
      setUploading(null);
      return;
    }

    if (slotId) {
      setUploads((prev) => ({
        ...prev,
        [slotId]: { url: data.url, fileName: data.fileName, folder },
      }));

      // Save to site_images in Supabase
      const updated = { ...siteImages, [slotId]: data.url };
      await saveSiteImages(updated);
    } else {
      setProductUploads((prev) => [
        ...prev,
        { url: data.url, fileName: data.fileName, folder },
      ]);
    }

    setUploading(null);
  }

  function handleSlotUpload(e: React.ChangeEvent<HTMLInputElement>, slot: typeof imageSlots[0]) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file, slot.folder, slot.id);
  }

  function handleProductUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => handleUpload(file, "products"));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Site Images</h1>
      <p className="text-gray-500 text-sm mb-8">
        Upload images for your website appearance and products
      </p>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* KOL / Customer Feedback Images */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          KOL & Customer Feedback Images
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          These images appear as a sliding background in the &ldquo;Your skin, our mission&rdquo; section on the homepage.
          Upload KOL photos, customer feedback screenshots, etc.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => {
            const slotId = i === 0 ? "kol_image" : `kol_image_${i + 1}`;
            return (
              <div key={slotId} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-800 text-sm">
                      KOL / Feedback Image {i + 1}
                    </h3>
                    <p className="text-xs text-gray-400">Slideshow background image</p>
                  </div>
                  {uploads[slotId] && (
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                </div>

                {(uploads[slotId] || siteImages[slotId]) ? (
                  <div className="mb-3">
                    <img
                      src={uploads[slotId]?.url || siteImages[slotId]}
                      alt={`KOL ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <p className="text-xs text-green-600 mt-1 truncate">
                      {uploads[slotId]?.url || siteImages[slotId]}
                    </p>
                  </div>
                ) : (
                  <div className="w-full h-32 bg-gray-50 rounded-lg flex items-center justify-center mb-3">
                    <ImageIcon className="w-8 h-8 text-gray-300" />
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 px-4 py-2 bg-olive text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-sage-dark transition-colors">
                  <Upload className="w-4 h-4" />
                  {uploading === slotId ? "Uploading..." : "Upload Image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file, "images", slotId);
                    }}
                    disabled={uploading === slotId}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Product Images */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Product Images
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Upload product photos here. After uploading, copy the URL and paste it into the product editor
          under Products &gt; Edit &gt; Product Image URL.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-olive hover:bg-gray-50 transition-colors">
            <Upload className="w-10 h-10 text-gray-400" />
            <div className="text-center">
              <p className="font-medium text-gray-700">
                Click to upload product images
              </p>
              <p className="text-xs text-gray-400 mt-1">
                JPG, PNG, WebP up to 10MB. Select multiple files.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleProductUpload}
              disabled={uploading === "products"}
            />
          </label>

          {uploading === "products" && (
            <p className="text-sm text-olive mt-4 text-center">
              Uploading...
            </p>
          )}

          {/* Uploaded product images */}
          {productUploads.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Uploaded Images ({productUploads.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {productUploads.map((img, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-full h-28 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(img.url);
                          alert(`Copied: ${img.url}`);
                        }}
                        className="px-3 py-1.5 bg-white text-gray-800 rounded-md text-xs font-medium"
                      >
                        Copy URL
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {img.url}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Instructions */}
      <section>
        <div className="bg-olive/5 rounded-xl p-6 border border-olive/10">
          <h3 className="font-semibold text-olive mb-3">How to use uploaded images</h3>
          <ol className="space-y-2 text-sm text-olive/70">
            <li>
              <strong>1. Homepage collage:</strong> Upload the 4 collage images above. They
              will automatically appear on the homepage.
            </li>
            <li>
              <strong>2. Product images:</strong> Upload product photos in the Product Images
              section. Then go to Products &gt; Edit a product &gt; paste the copied URL
              into the Image URL field.
            </li>
            <li>
              <strong>3. Image tips:</strong> Use square images for products (800x800px).
              For collage images, use landscape/portrait as needed. Keep files under 2MB
              for fast loading.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
