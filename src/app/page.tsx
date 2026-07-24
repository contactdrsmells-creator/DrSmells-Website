import Link from "next/link";
import { getFeaturedProducts, getTestimonials, getHeroBanners, getSiteImages } from "@/lib/data";
import ProductCard from "@/components/ProductCard";
import VideoHero from "@/components/VideoHero";
import ValueProps from "@/components/ValueProps";
import { Star } from "lucide-react";
import TestimonialSlider from "@/components/TestimonialSlider";
import BrandSlideshow from "@/components/BrandSlideshow";

export default async function HomePage() {
  const [products, testimonials, banners, siteImages] = await Promise.all([
    getFeaturedProducts(),
    getTestimonials(),
    getHeroBanners(),
    getSiteImages(),
  ]);

  const banner = banners[0];

  return (
    <div>
      {/* Video Hero Section */}
      <VideoHero banner={banner} />

      {/* Value Proposition */}
      <ValueProps siteImages={siteImages} />

      {/* Featured Products */}
      <section className="py-6 md:py-8 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-olive mb-1">
            Dr.Smells Series
          </h2>
          <p className="text-center text-olive/60 mb-4">
            Our flagship odour solutions
          </p>
          <div className="grid grid-cols-2 gap-4 sm:gap-12 md:gap-24 max-w-4xl mx-auto">
            {products.slice(0, 2).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/shop"
              className="inline-block px-8 py-3 border-2 border-olive text-olive font-semibold rounded-full hover:bg-olive hover:text-white transition-colors"
            >
              View All Products
            </Link>
          </div>
        </div>
      </section>

      {/* How Our Products Different - Image Collage Layout */}
      <section className="py-8 md:py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center">
            {/* Left - Text */}
            <div className="text-center lg:text-left">
              <h2 className="text-3xl md:text-4xl font-bold text-olive mb-6 md:mb-8 leading-tight">
                How Our Products Different?
              </h2>
              <div className="space-y-2 md:space-y-4 text-olive/80 text-base md:text-lg leading-relaxed">
                <p className="font-semibold text-olive">NOT your ordinary deodorant.</p>
                <p>We don&apos;t merely mask odors with fragrance</p>
                <p>or block natural sweating with antiperspirants.</p>
                <p>Instead, we rejuvenate underarm skin cells,</p>
                <p>repair damaged tissue, and eliminate odor-causing bacteria.</p>
              </div>
            </div>

            {/* Right - Section Images Collage */}
            <div>
              {(() => {
                const images: string[] = [];
                if (siteImages.section_image) images.push(siteImages.section_image);
                if (siteImages.section_image_2) images.push(siteImages.section_image_2);
                if (siteImages.section_image_3) images.push(siteImages.section_image_3);
                if (siteImages.section_image_4) images.push(siteImages.section_image_4);

                if (images.length === 0) {
                  return (
                    <div className="aspect-[4/5] bg-pantone rounded-2xl flex items-center justify-center">
                      <span className="text-olive/30 text-sm">Upload image in admin</span>
                    </div>
                  );
                }

                if (images.length === 1) {
                  return (
                    <div className="rounded-2xl overflow-hidden">
                      <img src={images[0]} alt="How our products are different" className="w-full h-full object-cover rounded-2xl" loading="lazy" />
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    {images[0] && (
                      <div className="row-span-2 rounded-xl overflow-hidden">
                        <img src={images[0]} alt="Product showcase 1" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    {images[1] && (
                      <div className="rounded-xl overflow-hidden">
                        <img src={images[1]} alt="Product showcase 2" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    {images[2] && (
                      <div className="rounded-xl overflow-hidden">
                        <img src={images[2]} alt="Product showcase 3" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-8 md:py-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-olive mb-2">
            Everybody Loves Us
          </h2>
          <div className="flex justify-center gap-1 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-olive text-olive" />
            ))}
          </div>
          <p className="text-center text-olive/60 mb-10">
            Real reviews from verified customers
          </p>
          {/* Mobile: slider */}
          <div className="sm:hidden">
            <TestimonialSlider testimonials={testimonials} />
          </div>
          {/* Desktop: grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="p-6 text-center"
              >
                <div className="flex justify-center gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-olive text-olive"
                    />
                  ))}
                </div>
                <p className="text-olive/80 text-sm leading-relaxed mb-4">
                  {t.review}
                </p>
                <div>
                  <p className="text-sm font-semibold text-olive">
                    {t.name}
                  </p>
                  {t.verified && (
                    <p className="text-xs text-olive/50 mt-0.5">
                      Verified Purchaser
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand Story CTA with Slideshow */}
      <BrandSlideshow
        images={(() => {
          const imgs: string[] = [];
          for (let i = 1; i <= 10; i++) {
            const key = i === 1 ? "kol_image" : `kol_image_${i}`;
            if (siteImages[key]) imgs.push(siteImages[key]);
          }
          return imgs;
        })()}
      >
        <h2 className="text-2xl md:text-4xl font-bold mb-4">
          Your skin, our mission
        </h2>
        <p className="text-lg text-white/70 mb-2">smell like you</p>
        <p className="text-white/80 max-w-2xl mx-auto mb-8">
          At Dr.Smells, we believe everyone deserves to feel confident.
          Our products are crafted with care using natural, dermatologically-tested
          ingredients that work with your body, not against it.
        </p>
        <Link
          href="/about"
          className="inline-block px-8 py-3 bg-white text-olive font-semibold rounded-full hover:bg-white/90 transition-colors"
        >
          Our Story
        </Link>
      </BrandSlideshow>
    </div>
  );
}
