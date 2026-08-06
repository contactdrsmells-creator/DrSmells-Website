"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useSiteWidgets } from "@/lib/site-widgets";

/**
 * Promo entry in the Shop menu, last in the list under Bundle.
 *
 * Was a pill in the header beside the account icon. It reads as a category now,
 * so it is styled as one — set apart by a rule above it, the brand green and
 * the flame, rather than by sitting outside the navigation.
 *
 * Label, link and visibility all come from site settings — a promo changes far
 * more often than the site does — so this renders nothing when the promo is
 * switched off, leaving the menu ending at Bundle.
 */
export default function PromoMenuItem({
  variant,
  onClick,
}: {
  variant: "dropdown" | "mobile";
  onClick?: () => void;
}) {
  const { promo_enabled, promo_label, promo_href } = useSiteWidgets();

  if (!promo_enabled || !promo_href) return null;

  const shared = "flex items-center gap-1.5 font-bold uppercase tracking-wide text-sage";

  return (
    <Link
      href={promo_href}
      onClick={onClick}
      aria-label={promo_label}
      className={
        variant === "dropdown"
          ? `${shared} px-4 pt-3 pb-2 mt-1 border-t border-olive/10 text-xs hover:bg-pantone transition-colors`
          : `${shared} pl-2 text-sm`
      }
    >
      {promo_label}
      <Flame className="w-3.5 h-3.5 shrink-0" fill="currentColor" strokeWidth={1.5} />
    </Link>
  );
}
