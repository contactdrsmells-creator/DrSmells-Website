"use client";

import { useState, useEffect, useRef } from "react";

interface BrandSlideshowProps {
  images: string[];
  children: React.ReactNode;
}

export default function BrandSlideshow({ images, children }: BrandSlideshowProps) {
  const [offset, setOffset] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (images.length <= 3) return;
    intervalRef.current = setInterval(() => {
      setOffset((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [images.length]);

  if (images.length === 0) {
    return (
      <section className="py-8 md:py-10 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {children}
        </div>
      </section>
    );
  }

  // Get 3 visible images (or fewer if less uploaded)
  const count = Math.min(images.length, 3);
  const visible: string[] = [];
  for (let i = 0; i < count; i++) {
    visible.push(images[(offset + i) % images.length]);
  }

  return (
    <section className="relative w-full overflow-hidden">
      {/* 3 images side by side */}
      <div className="flex w-full" style={{ height: "60vh" }}>
        {visible.map((img, i) => (
          <div
            key={`${offset}-${i}`}
            className={`relative h-full flex-1 overflow-hidden ${i === 2 && count === 3 ? "hidden md:block" : ""}`}
            style={{
              animation: "fadeSlideIn 0.7s ease-in-out",
            }}
          >
            <img
              src={img}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* Dark overlay across all images */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Text content overlaid on all 3 images */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="text-center text-white px-4 max-w-3xl">
          {children}
        </div>
      </div>

      {/* Dots */}
      {images.length > 3 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setOffset(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === offset ? "bg-white" : "bg-white/40"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  );
}
