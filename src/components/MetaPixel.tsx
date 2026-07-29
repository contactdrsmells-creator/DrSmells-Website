"use client";

import Script from "next/script";

/**
 * Meta (Facebook) Pixel.
 *
 * The base pixel below only reports PageView — that measures traffic, not
 * revenue. Sales attribution comes from the Purchase event fired on the order
 * confirmation page once payment is confirmed (see trackPurchase).
 *
 * The pixel ID is not a secret; it is visible in the page source of every site
 * that uses one. The env var only exists so the ID can be changed without a
 * code edit.
 */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "974864253889078";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export default function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

interface PurchaseItem {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
}

/**
 * Reports a completed sale to Meta, exactly once per order.
 *
 * Refreshing the confirmation page — or a customer opening the link twice —
 * would otherwise report the same sale repeatedly and inflate reported ROAS.
 * The order number is recorded locally to prevent that, and also sent as
 * eventID so Meta can de-duplicate server-side if Conversions API is added
 * later.
 */
export function trackPurchase(
  orderNumber: string,
  total: number,
  items: PurchaseItem[] = [],
): void {
  if (typeof window === "undefined" || !window.fbq || !orderNumber) return;

  const storageKey = `fb_purchase_${orderNumber}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, "1");
  } catch {
    // Private browsing can block storage — reporting the sale matters more
    // than the (rare) risk of a duplicate, so continue.
  }

  // Value and currency are what Meta attributes revenue and ROAS from.
  // Product-level detail is only included when available: the public order
  // endpoint intentionally withholds line items, since order numbers are
  // guessable and shouldn't reveal what someone bought.
  const payload: Record<string, unknown> = {
    value: Number(total || 0),
    currency: "MYR",
  };

  if (items.length > 0) {
    payload.content_type = "product";
    payload.content_ids = items.map((i) => i.product_id).filter(Boolean);
    payload.contents = items.map((i) => ({
      id: i.product_id,
      quantity: i.quantity || 1,
      item_price: i.unit_price,
    }));
    payload.num_items = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  }

  window.fbq("track", "Purchase", payload, { eventID: orderNumber });
}

/** Fired when a customer reaches checkout — used for ad optimisation. */
export function trackInitiateCheckout(total: number, numItems: number): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "InitiateCheckout", {
    value: Number(total || 0),
    currency: "MYR",
    num_items: numItems,
  });
}
