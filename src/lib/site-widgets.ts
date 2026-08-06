"use client";

import { useEffect, useState } from "react";

/**
 * The two header/floating widgets, loaded from site settings.
 *
 * Both are editable in the admin panel rather than hardcoded, so the promo can
 * be pointed at a different category, relabelled or switched off for a campaign
 * without a deploy — and the WhatsApp number can change hands.
 *
 * Defaults are deliberately "off" for the promo and "on" for WhatsApp with the
 * number already in the site's social settings, so nothing appears unconfigured
 * and nothing disappears if the settings row is missing.
 */
export interface SiteWidgets {
  promo_enabled: boolean;
  promo_label: string;
  promo_href: string;
  whatsapp_enabled: boolean;
  whatsapp_url: string;
}

export const WIDGET_DEFAULTS: SiteWidgets = {
  promo_enabled: false,
  promo_label: "HOT PROMO",
  promo_href: "/shop?category=promo",
  whatsapp_enabled: true,
  whatsapp_url: "",
};

/** Normalises whatever is stored, so a half-filled row can't break the header. */
export function toWidgets(
  promo: Record<string, unknown> | undefined,
  social: Record<string, unknown> | undefined,
): SiteWidgets {
  const bool = (value: unknown, fallback: boolean) =>
    value === undefined || value === null || value === "" ? fallback : value === true || value === "true";

  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  return {
    promo_enabled: bool(promo?.enabled, WIDGET_DEFAULTS.promo_enabled),
    promo_label: text(promo?.label, WIDGET_DEFAULTS.promo_label),
    promo_href: text(promo?.href, WIDGET_DEFAULTS.promo_href),
    whatsapp_enabled: bool(promo?.whatsapp_enabled, WIDGET_DEFAULTS.whatsapp_enabled),
    // Falls back to the number already kept in the site's social links, so the
    // floating button works before anyone visits the new settings section.
    whatsapp_url: text(promo?.whatsapp_url, text(social?.whatsapp, "")),
  };
}

export function useSiteWidgets(): SiteWidgets {
  const [widgets, setWidgets] = useState<SiteWidgets>(WIDGET_DEFAULTS);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/site-settings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setWidgets(toWidgets(data?.promo, data?.social));
      })
      .catch(() => {
        // Settings unreachable: keep the defaults rather than breaking the page.
      });

    return () => { cancelled = true; };
  }, []);

  return widgets;
}
