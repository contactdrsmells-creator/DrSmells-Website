"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import { Product } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";

/**
 * Product search, in the navbar beside the account icon.
 *
 * Deliberately the one place hidden products can be found: everything else on
 * the site filters them out, so a product can be sold without being on display.
 * Nothing here filters on `hidden`.
 */

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const MAX_RESULTS = 6;

/**
 * PostgREST parses `.or()` as a comma-separated filter list, so a comma or
 * bracket typed into the box would be read as syntax rather than as text. `%`
 * and `_` are ilike wildcards. All of it is stripped rather than escaped —
 * none of it belongs in a product name.
 */
function sanitise(term: string): string {
  return term.replace(/[%_,()\\'"*:]/g, " ").replace(/\s+/g, " ").trim();
}

/** Mirrors how the storefront prices a card: a range when variants differ. */
function priceLabel(product: Product): string {
  const combo = (product.variation_combos || []).map((c) => c.sale_price ?? c.price);
  const variant = (product.variations || []).map((v) => v.sale_price ?? v.price);
  const prices = combo.length > 0 ? combo : variant;

  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `RM ${min.toFixed(2)}` : `RM ${min.toFixed(2)} – ${max.toFixed(2)}`;
  }

  const price = product.sale_price ?? product.price;
  return `RM ${Number(price || 0).toFixed(2)}`;
}

export default function SearchBox() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setResults([]);
    setSearched(false);
  }, []);

  // Focus on open, so the box can be typed into straight away.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    const query = sanitise(term);

    if (query.length < MIN_QUERY) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    // Debounced so typing a word is one request, not one per keystroke.
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .or(`name.ilike.%${query}%,short_description.ilike.%${query}%,category.ilike.%${query}%`)
        .order("sort_order")
        .limit(MAX_RESULTS);

      if (cancelled) return;
      setResults((data as Product[]) || []);
      setSearched(true);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close search" : "Search products"}
        aria-expanded={open}
        className="flex text-olive/60 hover:text-olive transition-colors"
      >
        {open ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-3 w-[min(22rem,calc(100vw-2rem))] bg-white border border-olive/10 rounded-xl shadow-xl overflow-hidden z-50"
          role="dialog"
          aria-label="Product search"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-olive/10">
            <Search className="w-4 h-4 text-olive/40 shrink-0" />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search products..."
              className="w-full text-sm text-olive placeholder:text-olive/40 bg-transparent outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-olive/40 animate-spin shrink-0" />}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {results.map((product) => (
              <Link
                key={product.id}
                href={`/product/${product.slug}`}
                onClick={close}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-sage-light/40 transition-colors"
              >
                {/* Plain img, as ProductCard uses: next/image would need every
                    storage host allowlisted in next.config, and none are. */}
                <div className="w-11 h-11 rounded-lg bg-white shrink-0 overflow-hidden">
                  {product.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt=""
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-olive truncate">{product.name}</p>
                  <p className="text-xs text-olive/50">{priceLabel(product)}</p>
                </div>
                {!product.in_stock && (
                  <span className="text-[10px] text-olive/40 shrink-0">Sold out</span>
                )}
              </Link>
            ))}

            {searched && !loading && results.length === 0 && (
              <p className="px-3 py-6 text-sm text-olive/50 text-center">
                Nothing matched &ldquo;{term.trim()}&rdquo;
              </p>
            )}

            {!searched && !loading && (
              <p className="px-3 py-6 text-sm text-olive/40 text-center">
                Type at least {MIN_QUERY} letters to search
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
