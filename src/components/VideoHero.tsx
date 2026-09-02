"use client";

import Link from "next/link";
import AutoVideo from "@/components/AutoVideo";

interface Banner {
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  video_url?: string | null;
  image_url?: string | null;
}

export default function VideoHero({ banner }: { banner?: Banner }) {
  return (
    <section className="relative w-full h-[70vh] md:h-[90vh] overflow-hidden bg-olive">
      {/* Video Background */}
      <AutoVideo
        src={banner?.video_url || "/videos/hero.mp4"}
        poster={banner?.image_url || undefined}
        eager
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center text-white px-4">
        {banner && (
          <>
            <span className="inline-block px-5 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-sm font-medium mb-6 tracking-wide">
              {banner.title}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-4 leading-tight max-w-4xl">
              {banner.subtitle}
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/80 mb-8 max-w-2xl">
              Dermatologically tested, natural odour solutions that truly work.
            </p>
            <div className="flex flex-row gap-3 sm:gap-4">
              <Link
                href={banner.cta_link}
                className="inline-block px-5 py-2.5 sm:px-8 sm:py-3.5 bg-cream text-olive font-semibold rounded-full hover:bg-sage-light transition-colors text-sm sm:text-lg"
              >
                {banner.cta_text}
              </Link>
              <Link
                href="/about"
                className="inline-block px-5 py-2.5 sm:px-8 sm:py-3.5 border-2 border-white/50 text-white font-semibold rounded-full hover:bg-white/10 transition-colors text-sm sm:text-lg"
              >
                Learn More
              </Link>
            </div>
          </>
        )}
      </div>

    </section>
  );
}
