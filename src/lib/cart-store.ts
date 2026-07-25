"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, Product } from "./types";

interface SubscriptionInfo {
  interval_months: number;
  price: number;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, size: string, subscription?: SubscriptionInfo | null) => void;
  removeItem: (productId: string, size: string, subscriptionKey?: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number, subscriptionKey?: string) => void;
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

      addItem: (product, size, subscription = null) => {
        const items = get().items;
        const subKey = subscription ? `sub-${subscription.interval_months}` : "onetime";
        const existing = items.find(
          (item) => item.product.id === product.id && item.selectedSize === size &&
            (item.subscription ? `sub-${item.subscription.interval_months}` : "onetime") === subKey
        );
        if (existing) {
          set({
            items: items.map((item) =>
              item.product.id === product.id && item.selectedSize === size &&
                (item.subscription ? `sub-${item.subscription.interval_months}` : "onetime") === subKey
                ? { ...item, quantity: item.quantity + 1 }
                : item
            ),
          });
        } else {
          set({ items: [...items, { product, quantity: 1, selectedSize: size, subscription }] });
        }
        set({ isOpen: true });
      },

      removeItem: (productId, size, subscriptionKey = "onetime") => {
        set({
          items: get().items.filter(
            (item) => !(item.product.id === productId && item.selectedSize === size &&
              (item.subscription ? `sub-${item.subscription.interval_months}` : "onetime") === subscriptionKey)
          ),
        });
      },

      updateQuantity: (productId, size, quantity, subscriptionKey = "onetime") => {
        if (quantity <= 0) {
          get().removeItem(productId, size, subscriptionKey);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.product.id === productId && item.selectedSize === size &&
              (item.subscription ? `sub-${item.subscription.interval_months}` : "onetime") === subscriptionKey
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
          // Subscription items use their own price
          if (item.subscription) {
            return sum + item.subscription.price * item.quantity;
          }
          // Check multi-attribute combo first
          const combos = item.product.variation_combos || [];
          if (combos.length > 0 && item.selectedSize.includes(": ")) {
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
