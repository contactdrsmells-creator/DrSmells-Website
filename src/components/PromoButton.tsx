"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useSiteWidgets } from "@/lib/site-widgets";

/**
 * Header promo pill.
 *
 * Sits to the left of the account icon on desktop. On mobile the account icon
 * is hidden, so the same position puts it to the left of the cart.
 *
 * Label, link and visibility all come from site settings — a promo changes far
 * more often than the site does.
 */
export default function PromoButton() {
  const { promo_enabled, promo_label, promo_href } = useSiteWidgets();

  if (!promo_enabled || !promo_href) return null;

  return (
    <Link
      href={promo_href}
      aria-label={promo_label}
      className="flex items-center gap-1.5 rounded-full bg-sage px-3 py-1.5 md:px-4 md:py-2
                 text-[11px] md:text-xs font-bold uppercase tracking-wide text-cream
                 shadow-sm ring-1 ring-inset ring-white/25
                 transition-colors hover:bg-sage-dark whitespace-nowrap"
    >
      {promo_label}
      <Flame className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" fill="currentColor" strokeWidth={1.5} />
    </Link>
  );
}
