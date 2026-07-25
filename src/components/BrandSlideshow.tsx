"use client";

import { useState, useEffect, useRef } from "react";

interface BrandSlideshowProps {
  images: string[];
  children: React.ReactNode;
}

export default function BrandSlideshow({ images, children }: BrandSlideshowProps) {
  const [offset, setOffset] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const visibleCount = 3;

  useEffect(() => {
    if (images.length <= visibleCount) return;
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

  const extendedImages = [...images, ...images, ...images];

  return (
    <section className="relative w-full overflow-hidden">
      <div style={{ height: "60vh", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            width: `${(extendedImages.length / visibleCount) * 100}%`,
            height: "100%",
            transform: `translateX(-${(offset * 100) / extendedImages.length}%)`,
            transition: "transform 1s ease-in-out",
          }}
        >
          {extendedImages.map((img, i) => (
            <div
              key={i}
              className={i % visibleCount === 2 ? "hidden md:block" : ""}
              style={{
                flex: `0 0 ${100 / extendedImages.length}%`,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <img
                src={img}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Text content */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="text-center text-white px-4 max-w-3xl">
          {children}
        </div>
      </div>

      {/* Dots */}
      {images.length > visibleCount && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setOffset(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === offset % images.length ? "bg-white" : "bg-white/40"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
