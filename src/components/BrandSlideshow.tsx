"use client";

import { useState, useEffect, useRef } from "react";

interface BrandSlideshowProps {
  images: string[];
  children: React.ReactNode;
}

export default function BrandSlideshow({ images, children }: BrandSlideshowProps) {
  const [offset, setOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const visibleCount = isMobile ? 2 : 3;

  useEffect(() => {
    if (images.length <= visibleCount) return;
    intervalRef.current = setInterval(() => {
      setOffset((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [images.length, visibleCount]);

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
  const itemWidth = 100 / extendedImages.length;

  return (
    <section className="relative w-full overflow-hidden">
      <div style={{ height: "60vh", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            width: `${(extendedImages.length / visibleCount) * 100}%`,
            height: "100%",
            transform: `translateX(-${offset * itemWidth}%)`,
            transition: "transform 1s ease-in-out",
          }}
        >
          {extendedImages.map((img, i) => (
            <div
              key={i}
              style={{
                flex: `0 0 ${itemWidth}%`,
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
    </section>
  );
}
