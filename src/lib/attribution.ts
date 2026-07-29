/**
 * Where a customer came from, captured on their first page view.
 *
 * Checkout used to read utm_source from its own URL, but the parameters only
 * exist on the landing page — by the time someone browses to /checkout they are
 * long gone, so every order was recorded as "Direct" no matter which ad brought
 * them. Attribution has to be captured on arrival and carried through.
 *
 * This is separate from the Meta Pixel: the pixel reports the sale to Meta for
 * Ads Manager, while this records the source on your own order for the CRM.
 */

const STORAGE_KEY = "drsmells_attribution";
const TTL_DAYS = 30;

export interface Attribution {
  source: string;
  medium?: string;
  campaign?: string;
  landing_page?: string;
  captured_at: number;
}

/** Referrers worth naming; anything else falls back to its hostname. */
const REFERRER_NAMES: Record<string, string> = {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  "lm.facebook.com": "Facebook",
  "tiktok.com": "TikTok",
  "google.com": "Google",
  "youtube.com": "YouTube",
  "shopee.com.my": "Shopee",
};

function resolveSource(params: URLSearchParams, referrer: string): string | null {
  const utm = params.get("utm_source") || params.get("ref");
  if (utm) return utm;

  // Meta and Google append these to ad clicks automatically, so paid traffic is
  // still identifiable even when UTM tags were never set up on the campaign.
  if (params.get("fbclid")) return "Meta";
  if (params.get("gclid")) return "Google";
  if (params.get("ttclid")) return "TikTok";

  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      if (host === window.location.hostname) return null; // internal navigation
      return REFERRER_NAMES[host] || host;
    } catch {
      /* malformed referrer — ignore */
    }
  }

  return null;
}

/**
 * Records attribution on arrival. Keeps the first source seen within the TTL:
 * the ad that introduced the customer is more meaningful than whatever tab they
 * happened to return through.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const source = resolveSource(params, document.referrer);
    if (!source) return;

    const existing = readAttribution();
    const hasExplicitTag = !!(params.get("utm_source") || params.get("ref") || params.get("fbclid"));

    // Don't let a plain referrer overwrite a tagged campaign already recorded.
    if (existing && !hasExplicitTag) return;

    const attribution: Attribution = {
      source,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
      landing_page: window.location.pathname,
      captured_at: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private browsing blocks storage; the order simply records "Direct".
  }
}

export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Attribution;
    const age = Date.now() - (parsed.captured_at || 0);
    if (age > TTL_DAYS * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The value stored on the order's `source` column. */
export function getOrderSource(): string {
  return readAttribution()?.source || "Direct";
}
