"use client";

import { useState, useEffect, useRef } from "react";
import { Star, Camera, X, ChevronDown, Check } from "lucide-react";
import { Review } from "@/lib/types";

interface ReviewSectionProps {
  productId: string;
  productName: string;
}

function StarRating({
  rating,
  onRate,
  size = "md",
}: {
  rating: number;
  onRate?: (r: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [hover, setHover] = useState(0);
  const sizeClass = size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-7 h-7" : "w-5 h-5";

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onRate?.(i)}
          onMouseEnter={() => onRate && setHover(i)}
          onMouseLeave={() => onRate && setHover(0)}
          className={onRate ? "cursor-pointer" : "cursor-default"}
          disabled={!onRate}
        >
          <Star
            className={`${sizeClass} ${
              i <= (hover || rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      <div className="border border-olive/10 rounded-xl p-5">
        <div className="flex items-start justify-between mb-2">
          <div>
            <StarRating rating={review.rating} size="sm" />
            {review.title && (
              <h4 className="font-semibold text-olive text-sm mt-2">{review.title}</h4>
            )}
          </div>
          <span className="text-xs text-olive/40">
            {new Date(review.created_at).toLocaleDateString("en-MY", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        <p className="text-olive/70 text-sm leading-relaxed mb-3">{review.body}</p>

        {/* Review Images */}
        {review.images && review.images.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {review.images.map((img, i) => (
              <button
                key={i}
                onClick={() => setLightbox(img)}
                className="w-16 h-16 rounded-lg overflow-hidden border border-olive/10 hover:opacity-80 transition-opacity"
              >
                <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-olive/10 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-olive">
              {review.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-olive">{review.name}</p>
            {review.verified && (
              <div className="flex items-center gap-1">
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-[10px] text-green-600">Verified Purchaser</span>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </>
  );
}

function WriteReviewForm({
  productId,
  onSubmitted,
}: {
  productId: string;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    setError("");

    for (const file of Array.from(files)) {
      if (images.length >= 5) break;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/reviews/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setImages((prev) => [...prev, data.url]);
      } else {
        setError(data.error || "Upload failed");
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (rating === 0) {
      setError("Please select a star rating");
      return;
    }
    if (!name.trim() || !email.trim() || !body.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    setSubmitting(true);

    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        name: name.trim(),
        email: email.trim(),
        rating,
        title: title.trim(),
        body: body.trim(),
        images,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Failed to submit review");
      return;
    }

    setSuccess(true);
    onSubmitted();
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-olive mb-2">Thank you for your review!</h3>
        <p className="text-olive/60 text-sm">
          Your review has been submitted and will appear once approved.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Star Rating */}
      <div>
        <label className="block text-sm font-medium text-olive mb-2">
          Rating <span className="text-red-400">*</span>
        </label>
        <StarRating rating={rating} onRate={setRating} size="lg" />
      </div>

      {/* Name & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-olive mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-olive/20 rounded-lg text-sm focus:outline-none focus:border-olive"
            placeholder="Your name"
            maxLength={100}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-olive mb-1">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border border-olive/20 rounded-lg text-sm focus:outline-none focus:border-olive"
            placeholder="your@email.com"
            maxLength={200}
          />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-olive mb-1">Review Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-2.5 border border-olive/20 rounded-lg text-sm focus:outline-none focus:border-olive"
          placeholder="Sum up your experience"
          maxLength={200}
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-olive mb-1">
          Your Review <span className="text-red-400">*</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full px-4 py-2.5 border border-olive/20 rounded-lg text-sm focus:outline-none focus:border-olive resize-none"
          rows={4}
          placeholder="Tell others about your experience with this product..."
          maxLength={2000}
        />
        <p className="text-xs text-olive/40 mt-1">{body.length}/2000</p>
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-olive mb-2">
          Add Photos <span className="text-olive/40 font-normal">(optional, max 5)</span>
        </label>
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative w-20 h-20">
              <img src={img} alt="" className="w-full h-full object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <label className="w-20 h-20 border-2 border-dashed border-olive/20 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-olive/40 transition-colors">
              <Camera className="w-5 h-5 text-olive/30" />
              <span className="text-[10px] text-olive/30 mt-1">
                {uploading ? "..." : "Add"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleImageUpload}
                disabled={uploading}
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-olive text-white font-semibold rounded-full hover:bg-sage-dark transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
}

const REVIEWS_PER_PAGE = 6;

export default function ReviewSection({ productId, productName }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0); // 0 = all
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "highest" | "lowest">("highest");
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(1);

  async function loadReviews() {
    const res = await fetch(`/api/reviews?product_id=${productId}`);
    if (res.ok) {
      const data = await res.json();
      setReviews(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReviews();
  }, [productId]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [filterRating, sortBy]);

  // Calculate stats
  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  // Filter & sort
  const filtered = filterRating > 0
    ? reviews.filter((r) => r.rating === filterRating)
    : reviews;

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "highest") return b.rating - a.rating;
    if (sortBy === "lowest") return a.rating - b.rating;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / REVIEWS_PER_PAGE);
  const paged = sorted.slice((page - 1) * REVIEWS_PER_PAGE, page * REVIEWS_PER_PAGE);

  return (
    <section className="py-8 md:py-10 bg-white border-t border-olive/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact Header — single line like reference */}
        <div className="text-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-olive mb-1">
            Customer Reviews
          </h2>
          <div className="flex items-center justify-center gap-2">
            <StarRating rating={Math.round(avgRating)} size="sm" />
            <span className="text-sm font-semibold text-olive">
              {avgRating > 0 ? avgRating.toFixed(1) : "—"} out of 5
            </span>
            <span className="text-olive/40 text-xs">
              Based on {totalReviews} review{totalReviews !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Filter + Sort + Write — single row */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-olive/10">
          {/* Desktop: show filter pills inline */}
          <div className="hidden md:flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterRating(0)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filterRating === 0
                  ? "bg-olive text-white"
                  : "bg-gray-100 text-olive/60 hover:bg-gray-200"
              }`}
            >
              All ({totalReviews})
            </button>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts.find((r) => r.star === star)?.count || 0;
              return (
                <button
                  key={star}
                  onClick={() => setFilterRating(filterRating === star ? 0 : star)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-0.5 ${
                    filterRating === star
                      ? "bg-olive text-white"
                      : "bg-gray-100 text-olive/60 hover:bg-gray-200"
                  }`}
                >
                  {star}<Star className="w-2.5 h-2.5 fill-current" />({count})
                </button>
              );
            })}
          </div>

          {/* Mobile: filter dropdown */}
          <div className="relative md:hidden">
            <button
              onClick={() => { setShowFilter(!showFilter); setShowSort(false); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-olive/60 hover:text-olive transition-colors"
            >
              {filterRating > 0 ? `${filterRating}★` : "Filter"} <ChevronDown className="w-3 h-3" />
            </button>
            {showFilter && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-olive/10 rounded-lg shadow-lg py-1 z-20 min-w-[130px]">
                <button
                  onClick={() => { setFilterRating(0); setShowFilter(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-olive/5 ${filterRating === 0 ? "text-olive font-semibold" : "text-olive/60"}`}
                >
                  All ({totalReviews})
                </button>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingCounts.find((r) => r.star === star)?.count || 0;
                  return (
                    <button
                      key={star}
                      onClick={() => { setFilterRating(filterRating === star ? 0 : star); setShowFilter(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-olive/5 ${filterRating === star ? "text-olive font-semibold" : "text-olive/60"}`}
                    >
                      {star}★ ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => { setShowSort(!showSort); setShowFilter(false); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-olive/60 hover:text-olive transition-colors"
              >
                Sort <ChevronDown className="w-3 h-3" />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-olive/10 rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
                  {(["highest", "lowest", "newest"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setSortBy(opt);
                        setShowSort(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-olive/5 ${
                        sortBy === opt ? "text-olive font-semibold" : "text-olive/60"
                      }`}
                    >
                      {opt === "newest" ? "Newest" : opt === "highest" ? "Highest Rated" : "Lowest Rated"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-3 py-1.5 bg-olive text-white text-xs font-semibold rounded-full hover:bg-sage-dark transition-colors"
            >
              Write a Review
            </button>
          </div>
        </div>

        {/* Write Review Form */}
        {showForm && (
          <div className="mb-8 border border-olive/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-olive mb-4">
              Write a Review for {productName}
            </h3>
            <WriteReviewForm
              productId={productId}
              onSubmitted={() => {
                loadReviews();
              }}
            />
          </div>
        )}

        {/* Review List — 6 per page */}
        {loading ? (
          <div className="text-center py-12 text-olive/40">Loading reviews...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-olive/40 mb-4">
              {filterRating > 0
                ? `No ${filterRating}-star reviews yet.`
                : "No reviews yet. Be the first to review!"}
            </p>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="px-6 py-2.5 bg-olive text-white text-sm font-semibold rounded-full hover:bg-sage-dark transition-colors"
              >
                Write a Review
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paged.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm text-olive/60 hover:text-olive disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                      page === i + 1
                        ? "bg-olive text-white"
                        : "text-olive/60 hover:bg-olive/10"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm text-olive/60 hover:text-olive disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
