"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Product, ProductPageSections, FAQ } from "@/lib/types";
import { sampleProducts } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { useCartStore } from "@/lib/cart-store";
import { ShieldCheck, Leaf, Truck, Minus, Plus, ChevronDown, ChevronUp, Star, ChevronLeft, ChevronRight } from "lucide-react";
import ValueProps from "@/components/ValueProps";
import SafeHTML from "@/components/SafeHTML";
import ReviewSection from "@/components/ReviewSection";

// Accordion component
function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-olive/10 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-olive text-sm md:text-base">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-olive/40" /> : <Plus className="w-4 h-4 text-olive/40" />}
      </button>
      {open && <div className="px-5 pb-4 text-olive/70 text-sm leading-relaxed bg-pantone">{children}</div>}
    </div>
  );
}

export default function ProductPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [purchaseType, setPurchaseType] = useState<"onetime" | "subscribe">("onetime");
  const [selectedInterval, setSelectedInterval] = useState<number>(1);
  const addItem = useCartStore((s) => s.addItem);

  const isConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  useEffect(() => {
    async function load() {
      if (!isConfigured) {
        const p = sampleProducts.find((p) => p.slug === slug) || null;
        setProduct(p);
        if (p?.sizes.length) setSelectedSize(p.sizes[0]);
        setRelatedProducts(sampleProducts.filter((x) => x.slug !== slug).slice(0, 4));
        return;
      }

      const [productRes, allProductsRes, siteImagesRes] = await Promise.all([
        supabase.from("products").select("*").eq("slug", slug).single(),
        supabase.from("products").select("*").order("sort_order"),
        supabase.from("site_settings").select("*").eq("key", "site_images"),
      ]);

      if (productRes.data) {
        setProduct(productRes.data as Product);
        if (productRes.data.sizes?.length) setSelectedSize(productRes.data.sizes[0]);
        // Use manually selected related products, fallback to other products
        const relatedIds = productRes.data.related_products || [];
        const allProds = (allProductsRes.data || []) as Product[];
        if (relatedIds.length > 0) {
          setRelatedProducts(allProds.filter((p) => relatedIds.includes(p.id)));
        } else {
          setRelatedProducts(allProds.filter((p) => p.slug !== slug).slice(0, 4));
        }
      }
      if (siteImagesRes.data?.[0]) setSiteImages(siteImagesRes.data[0].value as Record<string, string>);
    }
    load();
    setActiveImage(0);
    setQuantity(1);
  }, [slug]);

  if (!product) {
    return (
      <div className="bg-white max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="w-64 h-64 bg-gray-100 rounded-2xl mx-auto mb-6" />
          <div className="h-6 bg-gray-100 rounded w-48 mx-auto mb-4" />
          <div className="h-4 bg-gray-100 rounded w-32 mx-auto" />
        </div>
      </div>
    );
  }

  // Multi-attribute variation system
  const varAttrs = product.variation_attributes || [];
  const varCombos = product.variation_combos || [];
  const hasMultiAttr = varAttrs.length >= 2 && varCombos.length > 0;

  // Find matching combo based on selected attributes
  const matchedCombo = hasMultiAttr
    ? varCombos.find(c => varAttrs.every(a => c.selections[a.name] === selectedAttrs[a.name]))
    : null;
  const allAttrsSelected = hasMultiAttr ? varAttrs.every(a => selectedAttrs[a.name]) : true;

  // Get price — multi-attr combo > simple variation > product-level
  const variations = product.variations || [];
  const selectedVariation = variations.find((v) => v.name === selectedSize);
  const currentPrice = hasMultiAttr
    ? (matchedCombo?.price ?? product.price)
    : (selectedVariation?.price ?? product.price);
  const currentSalePrice = hasMultiAttr
    ? (matchedCombo?.sale_price ?? null)
    : (selectedVariation?.sale_price ?? product.sale_price);
  const displayPrice = currentSalePrice ?? currentPrice;

  // Price range for multi-attr when not all selected
  const priceRange = hasMultiAttr && varCombos.length > 0
    ? {
        min: Math.min(...varCombos.map(c => c.sale_price ?? c.price)),
        max: Math.max(...varCombos.map(c => c.sale_price ?? c.price)),
      }
    : null;

  // Stock check for multi-attr
  const comboInStock = hasMultiAttr
    ? (matchedCombo ? matchedCombo.in_stock !== false : true)
    : product.in_stock;

  // Cart label for multi-attr
  const cartLabel = hasMultiAttr
    ? varAttrs.map(a => `${a.name}: ${selectedAttrs[a.name]}`).join(" | ")
    : selectedSize;

  const subOptions = product.subscription_options || [];
  const subEnabled = product.subscription_enabled && subOptions.length > 0;

  // Get subscription price from the selected variation/combo
  const variationSubPrice = hasMultiAttr
    ? (matchedCombo?.subscription_price ?? null)
    : (selectedVariation?.subscription_price ?? null);
  const subPrice = variationSubPrice ?? displayPrice;

  // Lowest subscription price across all variations/combos for display
  const lowestSubPrice = (() => {
    const prices: number[] = [];
    if (hasMultiAttr) {
      varCombos.forEach(c => { if (c.subscription_price != null) prices.push(c.subscription_price); });
    } else {
      variations.forEach(v => { if (v.subscription_price != null) prices.push(v.subscription_price); });
    }
    return prices.length > 0 ? Math.min(...prices) : null;
  })();

  const handleAddToCart = () => {
    if (hasMultiAttr && !allAttrsSelected) return;
    const subscription = purchaseType === "subscribe" && subEnabled
      ? { interval_months: selectedInterval, price: subPrice }
      : null;
    for (let i = 0; i < quantity; i++) {
      addItem(product, cartLabel, subscription);
    }
    setQuantity(1);
  };
  const allImages = product.images?.length > 0 ? product.images : (product.image_url ? [product.image_url] : []);

  // Get page sections from product data
  const sections: ProductPageSections = product.page_sections || {};
  const tellMeMoreFaqs = sections.tell_me_more_faqs || [];
  const askUsFaqs = sections.ask_us_faqs || [];

  return (
    <div className="bg-white">
      {/* ===== PRODUCT HERO ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14">
          {/* Image Gallery */}
          <div>
            <div className="relative aspect-square bg-white rounded-2xl flex items-center justify-center overflow-hidden mb-3">
              {allImages.length > 0 ? (
                <img
                  src={allImages[activeImage]}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto bg-olive/5 rounded-full flex items-center justify-center mb-4">
                    <span className="text-5xl text-olive font-bold">DS</span>
                  </div>
                  <p className="text-sm text-olive/40">Product Image</p>
                </div>
              )}
              {/* Left/Right Arrows */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveImage(activeImage === 0 ? allImages.length - 1 : activeImage - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-sm transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-olive" />
                  </button>
                  <button
                    onClick={() => setActiveImage(activeImage === allImages.length - 1 ? 0 : activeImage + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-sm transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-olive" />
                  </button>
                </>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                      activeImage === idx ? "border-olive" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-contain bg-white p-1" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-olive mb-3 text-center md:text-left">{product.name}</h1>
            {/* Price Display */}
            <div className="flex items-center gap-2 mb-5 justify-center md:justify-start">
              {hasMultiAttr && !allAttrsSelected && priceRange ? (
                <span className="text-base font-medium text-gray-500">
                  RM {priceRange.min.toFixed(2)} – RM {priceRange.max.toFixed(2)}
                </span>
              ) : currentSalePrice ? (
                <>
                  <span className="text-base font-medium text-gray-500">RM {currentSalePrice.toFixed(2)}</span>
                  <span className="text-sm text-gray-400 line-through">RM {currentPrice.toFixed(2)}</span>
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                    {Math.round(((currentPrice - currentSalePrice) / currentPrice) * 100)}% OFF
                  </span>
                </>
              ) : (
                <span className="text-base font-medium text-gray-500">RM {currentPrice.toFixed(2)}</span>
              )}
            </div>

            {product.description && (
              <div className="mb-6">
                <SafeHTML
                  html={product.description}
                  className="text-xs md:text-sm leading-relaxed prose prose-sm max-w-none text-center md:text-left"
                />
              </div>
            )}

            {/* Multi-Attribute Dropdowns */}
            {hasMultiAttr ? (
              <div className="mb-5 space-y-3">
                {varAttrs.map((attr) => (
                  <div key={attr.name} className="flex items-center gap-3 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="flex-1 px-4 py-3 text-sm font-bold text-olive">{attr.name}</p>
                    <select
                      value={selectedAttrs[attr.name] || ""}
                      onChange={(e) => setSelectedAttrs(prev => ({ ...prev, [attr.name]: e.target.value }))}
                      className="flex-1 px-3 py-3 border border-olive/15 rounded-lg text-sm text-olive bg-white focus:outline-none focus:border-olive appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                    >
                      <option value="">Select here</option>
                      {attr.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {allAttrsSelected && matchedCombo && !comboInStock && (
                  <p className="text-sm text-red-500">Out of stock</p>
                )}
                {Object.keys(selectedAttrs).length > 0 && (
                  <button
                    onClick={() => setSelectedAttrs({})}
                    className="text-xs text-olive/50 hover:text-olive underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : product.sizes.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-olive uppercase tracking-wide mb-2">Size</p>
                <div className="flex gap-2">
                  {product.sizes.map((size) => (
                    <button key={size} onClick={() => setSelectedSize(size)}
                      className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${selectedSize === size ? "bg-olive text-white" : "bg-gray-100 text-olive/70 hover:bg-gray-200"}`}
                    >{size}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase Type: One-time vs Subscribe */}
            {subEnabled && (
              <div className="mb-5 space-y-2">
                <button
                  onClick={() => setPurchaseType("onetime")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                    purchaseType === "onetime" ? "border-olive bg-olive/5" : "border-olive/15 hover:border-olive/30"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    purchaseType === "onetime" ? "border-olive" : "border-olive/30"
                  }`}>
                    {purchaseType === "onetime" && <span className="w-2.5 h-2.5 rounded-full bg-olive" />}
                  </span>
                  <span className="text-sm text-olive">
                    <span className="font-medium">Purchase one time</span>
                    <span className="font-bold ml-1">RM{displayPrice.toFixed(2)}</span>
                  </span>
                </button>

                <button
                  onClick={() => { setPurchaseType("subscribe"); if (!selectedInterval && subOptions.length > 0) setSelectedInterval(subOptions[0].interval_months); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                    purchaseType === "subscribe" ? "border-olive bg-olive/5" : "border-olive/15 hover:border-olive/30"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    purchaseType === "subscribe" ? "border-olive" : "border-olive/30"
                  }`}>
                    {purchaseType === "subscribe" && <span className="w-2.5 h-2.5 rounded-full bg-olive" />}
                  </span>
                  <span className="text-sm text-olive">
                    <span className="font-medium">Subscribe from</span>
                    <span className="font-bold ml-1" style={{ color: "#9a8c2c" }}>RM{(lowestSubPrice ?? subPrice).toFixed(2)} / month</span>
                  </span>
                </button>

                {purchaseType === "subscribe" && (
                  <div className="ml-8">
                    <p className="text-xs font-semibold text-olive uppercase tracking-wide mb-2">Deliver:</p>
                    <select
                      value={selectedInterval}
                      onChange={(e) => setSelectedInterval(parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 border border-olive/20 rounded-lg text-sm text-olive bg-white focus:outline-none focus:border-olive appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                    >
                      {subOptions.map((opt) => (
                        <option key={opt.interval_months} value={opt.interval_months}>
                          Every {opt.interval_months} month{opt.interval_months > 1 ? "s" : ""} for RM{subPrice.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end gap-3 mb-6">
              <div>
                <p className="text-xs font-semibold text-olive uppercase tracking-wide mb-2">Quantity</p>
                <div className="inline-flex items-center border border-olive/20 rounded-full">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors rounded-l-full text-olive"><Minus className="w-4 h-4" /></button>
                  <span className="w-10 text-center text-sm font-semibold text-olive">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors rounded-r-full text-olive"><Plus className="w-4 h-4" /></button>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={hasMultiAttr ? (!allAttrsSelected || !comboInStock) : !product.in_stock}
                className="flex-1 py-3 bg-olive text-white font-semibold rounded-full text-sm hover:bg-sage-dark transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {hasMultiAttr
                ? (!allAttrsSelected
                  ? "Select Options"
                  : !comboInStock
                    ? "Out of Stock"
                    : purchaseType === "subscribe" && subEnabled
                      ? `Subscribe — RM ${(subPrice * quantity).toFixed(2)}/mo`
                      : `Add to Cart — RM ${(displayPrice * quantity).toFixed(2)}`)
                : (product.in_stock
                  ? purchaseType === "subscribe" && subEnabled
                    ? `Subscribe — RM ${(subPrice * quantity).toFixed(2)}/mo`
                    : `Add to Cart — RM ${(displayPrice * quantity).toFixed(2)}`
                  : "Out of Stock")}
            </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: ShieldCheck, text: "Dermatologically Tested" },
                { icon: Leaf, text: "Vegan & Cruelty-Free" },
                { icon: Truck, text: "Free Shipping" },
              ].map((badge) => (
                <div key={badge.text} className="text-center py-3 border border-olive/10 rounded-xl">
                  <badge.icon className="w-5 h-5 mx-auto text-olive mb-1" strokeWidth={1.5} />
                  <p className="text-[11px] text-olive/60">{badge.text}</p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* ===== SECTION 1: Value Props ===== */}
      {sections.value_props_items && sections.value_props_items.length > 0 && (
        <ValueProps
          siteImages={siteImages}
          productData={{ heading: sections.value_props_heading, items: sections.value_props_items }}
        />
      )}

      {/* ===== SECTION 2: Tell Me More ===== */}
      {(sections.tell_me_more_image || sections.tell_me_more_title || sections.tell_me_more_description || tellMeMoreFaqs.length > 0) && (
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
            {/* Left - Circle Image */}
            {sections.tell_me_more_image && (
            <div className="flex justify-center">
              <div className="w-[280px] h-[280px] md:w-[350px] md:h-[350px] lg:w-[450px] lg:h-[450px] rounded-full border border-olive/10 flex items-center justify-center overflow-hidden">
                <img src={sections.tell_me_more_image} alt="Tell Me More" className="w-full h-full object-cover" loading="lazy" />
              </div>
            </div>
            )}

            {/* Right - Text + FAQ */}
            <div>
              {sections.tell_me_more_title && (
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-olive mb-4 md:mb-6">
                {sections.tell_me_more_title}
              </h2>
              )}
              {sections.tell_me_more_description && (
              <p className="text-olive/70 text-sm md:text-base lg:text-lg leading-relaxed mb-6 md:mb-8 whitespace-pre-line">
                {sections.tell_me_more_description}
              </p>
              )}
              {tellMeMoreFaqs.length > 0 && (
                <div>
                  {tellMeMoreFaqs.map((faq, idx) => (
                    <Accordion key={idx} title={faq.question}>
                      <p>{faq.answer}</p>
                    </Accordion>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ===== SECTION 3: How It Works (Video) ===== */}
      {(sections.how_it_works_title || sections.how_it_works_description || sections.how_it_works_video) && (
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
            {sections.how_it_works_video && (
              <div className="overflow-hidden order-first lg:order-last">
                <video
                  src={sections.how_it_works_video}
                  autoPlay
                  loop
                  muted
                  className="w-full"
                  playsInline
                />
              </div>
            )}
            <div>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-olive mb-4 md:mb-6">
                {sections.how_it_works_title || "How it works?"}
              </h2>
              <p className="text-olive/70 text-sm md:text-base lg:text-lg leading-relaxed whitespace-pre-line">
                {sections.how_it_works_description}
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ===== SECTION 4: How To Use ===== */}
      {(sections.how_to_use_image || sections.how_to_use_description) && (
        <section className="py-10 md:py-14 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
              {sections.how_to_use_image && (
                <div className="rounded-2xl overflow-hidden">
                  <img src={sections.how_to_use_image} alt="How To Use" className="w-full object-contain rounded-2xl" loading="lazy" />
                </div>
              )}
              <div>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-olive mb-4 md:mb-6">How To Use</h2>
                <p className="text-olive/70 text-sm md:text-base lg:text-lg leading-relaxed whitespace-pre-line">
                  {sections.how_to_use_description || "Upload usage instructions in admin dashboard."}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== SECTION 5: Ask Us Anything ===== */}
      {(sections.ask_us_title || sections.ask_us_subtitle || askUsFaqs.length > 0 || sections.ask_us_faq_link || sections.ask_us_contact_link) && (
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
            {/* Left - CTA */}
            <div className="flex flex-col justify-center">
              <h2 className="text-3xl md:text-4xl font-bold text-olive mb-3">
                {sections.ask_us_title || "Ask Us Anything"}
              </h2>
              {sections.ask_us_subtitle && (
              <p className="text-olive/60 text-lg mb-8">
                {sections.ask_us_subtitle}
              </p>
              )}
              <div className="flex flex-wrap gap-3">
                {sections.ask_us_faq_link && (
                  <Link
                    href={sections.ask_us_faq_link}
                    className="px-6 py-3 bg-pantone text-olive font-semibold rounded-lg hover:opacity-80 transition-opacity text-sm uppercase tracking-wide"
                  >
                    Read More FAQs
                  </Link>
                )}
                {sections.ask_us_contact_link && (
                  <Link
                    href={sections.ask_us_contact_link}
                    className="px-6 py-3 bg-pantone text-olive font-semibold rounded-lg hover:opacity-80 transition-opacity text-sm uppercase tracking-wide"
                  >
                    Contact Us
                  </Link>
                )}
              </div>
            </div>

            {/* Right - FAQ */}
            {askUsFaqs.length > 0 && (
            <div>
              {askUsFaqs.map((faq, idx) => (
                <Accordion key={idx} title={faq.question}>
                  <p>{faq.answer}</p>
                </Accordion>
              ))}
            </div>
            )}
          </div>
        </div>
      </section>
      )}

      {/* ===== SECTION 6: Customer Reviews ===== */}
      <ReviewSection productId={product.id} productName={product.name} />

      {/* ===== YOU MAY ALSO LIKE ===== */}
      {relatedProducts.length > 0 && (
        <section className="py-10 md:py-14 bg-white border-t border-olive/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl md:text-2xl font-bold text-olive text-center mb-8">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 max-w-5xl mx-auto">
              {relatedProducts.slice(0, 4).map((p) => (
                <Link key={p.id} href={`/product/${p.slug}`} className="group text-center">
                  <div className="aspect-[3/4] flex items-center justify-center overflow-hidden mb-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-20 h-20 bg-olive/5 rounded-full flex items-center justify-center">
                        <span className="text-2xl text-olive/30 font-bold">DS</span>
                      </div>
                    )}
                  </div>
                  <h3 className="font-medium text-olive text-sm group-hover:opacity-70 transition-opacity">{p.name}</h3>
                  <p className="text-sm font-bold text-olive mt-1">RM {(p.sale_price ?? p.price).toFixed(2)}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
