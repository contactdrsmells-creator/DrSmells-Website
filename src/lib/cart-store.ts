"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, Product } from "./types";
import { resolveUnitPrice } from "./pricing";

interface SubscriptionInfo {
  interval_months: number;
  price: number;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, size: string, subscription?: SubscriptionInfo | null, qty?: number) => void;
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

      // `qty` so adding ten is one store write rather than ten. The product
      // page used to call this in a loop, which meant a quantity of 250 — a
      // real case for the RM1 item, where the quantity IS the price — fired
      // hundreds of updates, each re-rendering and rewriting localStorage.
      addItem: (product, size, subscription = null, qty = 1) => {
        const amount = Math.max(1, Math.floor(qty) || 1);
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
                ? { ...item, quantity: item.quantity + amount }
                : item
            ),
          });
        } else {
          set({ items: [...items, { product, quantity: amount, selectedSize: size, subscription }] });
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
          return sum + resolveUnitPrice(item.product, item.selectedSize) * item.quantity;
        }, 0),
    }),
    { name: "drsmells-cart" }
  )
);
