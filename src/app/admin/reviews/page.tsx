"use client";

import { useState, useEffect, useRef } from "react";
import { Star, Check, X, Eye, EyeOff, Trash2, ShieldCheck, Image as ImageIcon, Download, Upload, ChevronDown, Filter } from "lucide-react";

interface AdminReview {
  id: string;
  product_id: string;
  name: string;
  email: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
  verified: boolean;
  approved: boolean;
  created_at: string;
  products?: { name: string; slug: string };
}

interface ProductOption {
  id: string;
  name: string;
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterRating, setFilterRating] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadReviews() {
    const res = await fetch("/api/reviews?all=true");
    if (res.ok) {
      const data = await res.json();
      setReviews(data);
      // Extract unique products from reviews
      const productMap = new Map<string, string>();
      data.forEach((r: AdminReview) => {
        if (r.product_id && r.products?.name) {
          productMap.set(r.product_id, r.products.name);
        }
      });
      setProducts(
        Array.from(productMap.entries()).map(([id, name]) => ({ id, name }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReviews();
  }, []);

  async function toggleApproved(id: string, approved: boolean) {
    await fetch("/api/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approved }),
    });
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, approved } : r))
    );
  }

  async function toggleVerified(id: string, verified: boolean) {
    await fetch("/api/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, verified }),
    });
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, verified } : r))
    );
  }

  async function deleteReview(id: string) {
    if (!confirm("Delete this review permanently?")) return;
    await fetch(`/api/reviews?id=${id}`, { method: "DELETE" });
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }

  // Export reviews as CSV
  /**
   * Exports dates as plain YYYY-MM-DD so a file can be edited in Excel and
   * re-imported unchanged. Full timestamps round-trip badly — spreadsheets
   * reformat them on open.
   */
  const toDateOnly = (value: string) => (value ? String(value).slice(0, 10) : "");

  function exportCSV() {
    const rows = filtered.map((r) => ({
      name: r.name,
      email: r.email,
      rating: r.rating,
      title: r.title,
      body: r.body,
      product: r.products?.name || "",
      product_id: r.product_id,
      verified: r.verified,
      approved: r.approved,
      images: (r.images || []).join(";"),
      created_at: toDateOnly(r.created_at),
    }));

    const headers = Object.keys(rows[0] || {});
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = String((row as Record<string, unknown>)[h] || "");
            // Escape CSV values with commas or quotes
            return val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reviews-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export reviews as JSON
  function exportJSON() {
    const data = filtered.map((r) => ({
      name: r.name,
      email: r.email,
      rating: r.rating,
      title: r.title,
      body: r.body,
      product_name: r.products?.name || "",
      product_id: r.product_id,
      verified: r.verified,
      approved: r.approved,
      images: r.images || [],
      created_at: toDateOnly(r.created_at),
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reviews-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import reviews from file
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await file.text();
      let importData: Array<Record<string, unknown>> = [];

      if (file.name.endsWith(".json")) {
        importData = JSON.parse(text);
      } else if (file.name.endsWith(".csv")) {
        // Parse CSV
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) {
          alert("CSV file is empty or has no data rows.");
          setImporting(false);
          return;
        }
        const headers = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            obj[h] = values[idx] || "";
          });
          importData.push(obj);
        }
      } else {
        alert("Please upload a .csv or .json file");
        setImporting(false);
        return;
      }

      if (!Array.isArray(importData) || importData.length === 0) {
        alert("No valid reviews found in the file.");
        setImporting(false);
        return;
      }

      const res = await fetch("/api/reviews/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: importData }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Successfully imported ${result.count} review(s).`);
        loadReviews();
      } else {
        const err = await res.json();
        alert(`Import failed: ${err.error}`);
      }
    } catch (err) {
      alert("Failed to parse file. Please check the format.");
    }

    setImporting(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Simple CSV line parser that handles quoted fields
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  const filtered = reviews.filter((r) => {
    if (filter === "pending" && r.approved) return false;
    if (filter === "approved" && !r.approved) return false;
    if (filterProduct && r.product_id !== filterProduct) return false;
    if (filterRating > 0 && r.rating !== filterRating) return false;
    return true;
  });

  const pendingCount = reviews.filter((r) => !r.approved).length;

  const filteredIds = filtered.map((r) => r.id);
  const selectedCount = selected.size;
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Select-all applies to the current filter, not the whole table. */
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runBulk(action: "approve" | "hide" | "verify" | "unverify" | "delete") {
    const ids = filteredIds.filter((id) => selected.has(id));
    if (!ids.length) return;

    if (action === "delete" && !confirm(`Delete ${ids.length} review(s) permanently? This cannot be undone.`)) {
      return;
    }

    setBulkRunning(true);
    try {
      // The API caps each request, so large selections go in chunks.
      const CHUNK = 500;
      let affected = 0;

      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await fetch("/api/reviews/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + CHUNK), action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || `Bulk ${action} failed`);
          break;
        }
        affected += data.affected || 0;
      }

      setSelected(new Set());
      await loadReviews();
      if (affected) alert(`${affected} review(s) updated.`);
    } catch {
      alert("Bulk action failed");
    } finally {
      setBulkRunning(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Customer Reviews</h1>
          <p className="text-gray-500 text-sm mt-1">
            Moderate and manage customer reviews
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "pending", "approved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-olive text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "all" ? `All (${reviews.length})` : f === "pending" ? `Pending (${pendingCount})` : `Approved (${reviews.length - pendingCount})`}
          </button>
        ))}
      </div>

      {/* Product & Rating Filters + Import/Export */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Product Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-olive"
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Rating Filter */}
        <select
          value={filterRating}
          onChange={(e) => setFilterRating(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-olive"
        >
          <option value={0}>All Ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} Star{r !== 1 ? "s" : ""}
            </option>
          ))}
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Import/Export */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Importing..." : "Import"}
          </button>
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-olive text-white hover:bg-olive/90 transition-colors"
              disabled={filtered.length === 0}
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden hidden group-hover:block z-10 min-w-[120px]">
              <button
                onClick={exportCSV}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as CSV
              </button>
              <button
                onClick={exportJSON}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
              >
                Export as JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results count */}
      {(filterProduct || filterRating > 0) && (
        <p className="text-xs text-gray-400 mb-3">
          Showing {filtered.length} of {reviews.length} reviews
          {filterProduct && (
            <button onClick={() => setFilterProduct("")} className="ml-2 text-olive hover:underline">
              Clear product filter
            </button>
          )}
          {filterRating > 0 && (
            <button onClick={() => setFilterRating(0)} className="ml-2 text-olive hover:underline">
              Clear rating filter
            </button>
          )}
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading reviews...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No reviews found.</div>
      ) : (
        <div className="space-y-4">
          {/* Selection toolbar */}
          <div className="flex items-center gap-3 flex-wrap bg-white border rounded-xl px-4 py-3 sticky top-0 z-10">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
                className="w-4 h-4 accent-olive cursor-pointer"
              />
              <span className="text-sm text-gray-700">
                Select all {filtered.length !== reviews.length ? `${filtered.length} shown` : filtered.length}
              </span>
            </label>

            {selectedCount > 0 && (
              <>
                <span className="text-sm font-medium text-olive">{selectedCount} selected</span>
                <div className="flex items-center gap-2 flex-wrap ml-auto">
                  <button onClick={() => runBulk("approve")} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => runBulk("hide")} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50">
                    Hide
                  </button>
                  <button onClick={() => runBulk("verify")} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50">
                    Verify
                  </button>
                  <button onClick={() => runBulk("unverify")} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                    Unverify
                  </button>
                  <button onClick={() => runBulk("delete")} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">
                    Delete
                  </button>
                  <button onClick={() => setSelected(new Set())} disabled={bulkRunning}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">
                    Clear
                  </button>
                </div>
              </>
            )}
          </div>

          {filtered.map((review) => (
            <div
              key={review.id}
              className={`bg-white rounded-xl border p-5 ${
                selected.has(review.id)
                  ? "border-olive ring-1 ring-olive/30"
                  : review.approved ? "border-green-200" : "border-yellow-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <input
                  type="checkbox"
                  checked={selected.has(review.id)}
                  onChange={() => toggleOne(review.id)}
                  className="w-4 h-4 mt-1 accent-olive cursor-pointer flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i <= review.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">
                      {review.name}
                    </span>
                    <span className="text-xs text-gray-400">{review.email}</span>
                    {review.verified && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>

                  {/* Product */}
                  <p className="text-xs text-olive/50 mb-2">
                    Product: <span className="font-medium text-olive">{review.products?.name || "Unknown"}</span>
                  </p>

                  {/* Title & Body */}
                  {review.title && (
                    <h4 className="font-semibold text-gray-800 text-sm mb-1">
                      {review.title}
                    </h4>
                  )}
                  <p className="text-gray-600 text-sm mb-3">{review.body}</p>

                  {/* Images */}
                  {review.images && review.images.length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {review.images.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => setLightbox(img)}
                          className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80"
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Date */}
                  <p className="text-xs text-gray-400">
                    {/* Same YYYY-MM-DD the export uses, so what you see here
                        matches the file you edit and re-import. */}
                    {toDateOnly(review.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleApproved(review.id, !review.approved)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      review.approved
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                    }`}
                  >
                    {review.approved ? (
                      <>
                        <Eye className="w-3.5 h-3.5" /> Approved
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" /> Approve
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => toggleVerified(review.id, !review.verified)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      review.verified
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {review.verified ? "Verified" : "Verify"}
                  </button>
                  <button
                    onClick={() => deleteReview(review.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
