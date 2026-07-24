"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

interface Testimonial {
  id: string;
  name: string;
  rating: number;
  review: string;
  verified: boolean;
}

export default function TestimonialSlider({ testimonials }: { testimonials: Testimonial[] }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const total = testimonials.length;

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Auto-play every 2 seconds
  useEffect(() => {
    if (isPaused || total <= 1) return;
    intervalRef.current = setInterval(next, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, next, total]);

  if (total === 0) return null;

  const t = testimonials[current];

  return (
    <div
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative select-none"
    >
      {/* Review card */}
      <div className="px-8 py-4 min-h-[180px] flex flex-col items-center justify-center text-center">
        <div className="flex justify-center gap-1 mb-4">
          {Array.from({ length: t.rating }).map((_, i) => (
            <Star key={i} className="w-4 h-4 fill-olive text-olive" />
          ))}
        </div>
        <p className="text-olive/80 text-sm leading-relaxed mb-4 max-w-sm">
          {t.review}
        </p>
        <div>
          <p className="text-sm font-semibold text-olive">{t.name}</p>
          {t.verified && (
            <p className="text-xs text-olive/50 mt-0.5">Verified Purchaser</p>
          )}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={prev}
        className="absolute left-0 top-1/2 -translate-y-1/2 p-1.5 text-olive/30 hover:text-olive transition-colors"
        aria-label="Previous review"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-olive/30 hover:text-olive transition-colors"
        aria-label="Next review"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 mt-2">
        {testimonials.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === current ? "bg-olive" : "bg-olive/20"
            }`}
            aria-label={`Go to review ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
