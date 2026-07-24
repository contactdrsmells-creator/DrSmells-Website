"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { sampleProducts } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";

const categories = [
  { key: "", label: "All Products" },
  { key: "underarm", label: "Underarm" },
  { key: "mouth", label: "Mouth" },
  { key: "feet", label: "Feet" },
  { key: "bundle", label: "Bundle" },
];

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="bg-white max-w-7xl mx-auto px-4 py-16 text-center text-olive/40">Loading...</div>}>
      <ShopContent />
    </Suspense>
  );
}

function ShopContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category") || "";
  const [activeCategory, setActiveCategory] = useState(categoryParam);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveCategory(categoryParam);
  }, [categoryParam]);

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
      let items = (data as Product[]) || [];
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
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
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
