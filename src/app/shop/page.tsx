"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { sampleProducts } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { useSiteWidgets } from "@/lib/site-widgets";

const categories = [
  { key: "", label: "All Products" },
  { key: "underarm", label: "Underarm" },
  { key: "mouth", label: "Mouth" },
  { key: "feet", label: "Feet" },
  { key: "bundle", label: "Bundle" },
];

/**
 * The Hot Promo tab is added only while the promo is switched on, and carries
 * whatever it has been renamed to. A campaign that has ended should leave no
 * empty tab behind.
 */
const PROMO_CATEGORY = "promo";

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="bg-white max-w-7xl mx-auto px-4 py-16 text-center text-olive/40">Loading...</div>}>
      <ShopContent />
    </Suspense>
  );
}

function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { promo_enabled, promo_label } = useSiteWidgets();

  /**
   * The address bar is the only record of which category is showing.
   *
   * The tabs used to set React state and leave the URL alone, so the two could
   * disagree — and then a Shop menu link pointing at the URL you were already
   * on performed no navigation, leaving the old tab selected. Picking Hot Promo
   * and then All Products kept you on the promo.
   *
   * Deriving it from the URL also makes the back button work and a filtered
   * shop worth sharing.
   */
  const activeCategory = searchParams.get("category") || "";

  const selectCategory = (key: string) => {
    router.push(key ? `/shop?category=${encodeURIComponent(key)}` : "/shop", { scroll: false });
  };

  // The promo tab is offered only while the promo is running, and carries
  // whatever it has been renamed to. It still appears when someone arrives on
  // the promo URL directly, so the tab they are on is never the unlit one.
  const shownCategories =
    promo_enabled || activeCategory === PROMO_CATEGORY
      ? [...categories, { key: PROMO_CATEGORY, label: promo_label }]
      : categories;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const isConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
        !!process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!isConfigured) {
        const filtered = activeCategory
          ? sampleProducts.filter((p) => (p.categories || [p.category]).includes(activeCategory))
          : sampleProducts;
        setProducts(filtered);
        setLoading(false);
        return;
      }

      const { data } = await supabase.from("products").select("*").order("sort_order");
      // Hidden products are left out of All Products and of every category —
      // they are meant to be reachable by search and by their own link only.
      // "not true" rather than "is false", so a row predating the column still
      // shows.
      let items = ((data as Product[]) || []).filter((p) => p.hidden !== true);
      if (activeCategory) {
        items = items.filter((p) => (p.categories || []).includes(activeCategory));
      }
      setProducts(items);
      setLoading(false);
    }
    load();
  }, [activeCategory]);

  return (
    <div className="bg-white max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-olive mb-2">
        Shop
      </h1>
      <p className="text-olive/60 mb-8">
        Discover our range of natural odour solutions
      </p>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-10">
        {shownCategories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => selectCategory(cat.key)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.key
                ? "bg-olive text-cream"
                : "bg-sage-light text-olive/70 hover:bg-sage-bg"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-sage-light rounded-2xl mb-4" />
              <div className="h-4 bg-sage-light rounded w-3/4 mb-2" />
              <div className="h-4 bg-sage-light rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-olive/50 py-20">
          No products found in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
