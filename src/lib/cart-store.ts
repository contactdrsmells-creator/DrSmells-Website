"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, Product } from "./types";

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, size: string) => void;
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  setCartOpen: (open: boolean) => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (product, size) => {
        const items = get().items;
        const existing = items.find(
          (item) => item.product.id === product.id && item.selectedSize === size
        );
        if (existing) {
          set({
            items: items.map((item) =>
              item.product.id === product.id && item.selectedSize === size
                ? { ...item, quantity: item.quantity + 1 }
                : item
            ),
          });
        } else {
          set({ items: [...items, { product, quantity: 1, selectedSize: size }] });
        }
        set({ isOpen: true });
      },

      removeItem: (productId, size) => {
        set({
          items: get().items.filter(
            (item) => !(item.product.id === productId && item.selectedSize === size)
          ),
        });
      },

      updateQuantity: (productId, size, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId, size);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.product.id === productId && item.selectedSize === size
              ? { ...item, quantity }
              : item
          ),
        });
      },

      clearCart: () => set({ items: [] }),
      toggleCart: () => set({ isOpen: !get().isOpen }),
      setCartOpen: (open) => set({ isOpen: open }),

      totalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, item) => {
          // Check multi-attribute combo first
          const combos = item.product.variation_combos || [];
          if (combos.length > 0 && item.selectedSize.includes(": ")) {
            // Parse "Size: 30ml | Color: Red" back into selections
            const selections: Record<string, string> = {};
            item.selectedSize.split(" | ").forEach(part => {
              const [k, v] = part.split(": ");
              if (k && v) selections[k] = v;
            });
            const combo = combos.find(c =>
              Object.keys(selections).every(k => c.selections[k] === selections[k])
            );
            if (combo) {
              return sum + (combo.sale_price ?? combo.price) * item.quantity;
            }
          }
          // Fallback to simple variation
          const variation = (item.product.variations || []).find((v) => v.name === item.selectedSize);
          const price = variation
            ? (variation.sale_price ?? variation.price)
            : (item.product.sale_price ?? item.product.price);
          return sum + price * item.quantity;
        }, 0),
    }),
    { name: "drsmells-cart" }
  )
);
