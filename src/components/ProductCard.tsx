"use client";

import Link from "next/link";
import { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.slug}`} className="group text-center">
      {/* Image - no frame, blends with background */}
      <div className="aspect-[3/4] flex items-center justify-center relative overflow-hidden mb-4">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="text-center p-4">
            <div className="w-24 h-24 mx-auto bg-olive/5 rounded-full flex items-center justify-center mb-3">
              <span className="text-3xl text-olive/30 font-bold">DS</span>
            </div>
            <p className="text-xs text-olive/30">Product Image</p>
          </div>
        )}

        {product.sale_price && (
          <span className="absolute top-2 left-2 bg-olive text-white text-[10px] md:text-xs font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded">
            {Math.round(((product.price - product.sale_price) / product.price) * 100)}%<span className="text-[8px] md:text-[10px]">OFF</span>
          </span>
        )}
      </div>

      {/* Info */}
      <h3 className="font-medium text-olive text-base md:text-lg group-hover:opacity-70 transition-opacity">
        {product.name}
      </h3>
      <div className="mt-1 md:mt-2 flex items-center justify-center gap-1 md:gap-2 flex-wrap">
        {product.variation_combos && product.variation_combos.length > 0 ? (() => {
          const prices = product.variation_combos.map(v => v.sale_price ?? v.price);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          return (
            <span className="text-[13px] md:text-[15px] font-bold text-olive">
              {min === max ? `RM ${min.toFixed(2)}` : `RM ${min.toFixed(2)} – RM ${max.toFixed(2)}`}
            </span>
          );
        })() : product.variations && product.variations.length > 0 ? (() => {
          const prices = product.variations.map(v => v.sale_price ?? v.price);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          return (
            <span className="text-[13px] md:text-[15px] font-bold text-olive">
              {min === max ? `RM ${min.toFixed(2)}` : `RM ${min.toFixed(2)} – RM ${max.toFixed(2)}`}
            </span>
          );
        })() : product.sale_price ? (
          <>
            <span className="text-[13px] md:text-[15px] font-bold text-olive">
              RM {product.sale_price.toFixed(2)}
            </span>
            <span className="text-xs md:text-sm text-olive/40 line-through">
              RM {product.price.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-[13px] md:text-[15px] font-bold text-olive">
            RM {product.price.toFixed(2)}
          </span>
        )}
      </div>
      {product.sizes.length > 0 && (
        <div className="mt-2 flex justify-center gap-1">
          {product.sizes.map((size) => (
            <span
              key={size}
              className="text-[11px] md:text-[13px] text-olive/50"
            >
              {size}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
