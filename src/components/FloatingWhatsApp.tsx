"use client";

import { useSiteWidgets } from "@/lib/site-widgets";

/**
 * Floating WhatsApp button, bottom right of every page.
 *
 * Sits above the page rather than in the footer so it stays reachable while
 * someone is reading a product or filling in checkout — which is where the
 * questions actually arise.
 *
 * The link is editable in site settings, falling back to the WhatsApp number
 * already stored in the social links.
 */
export default function FloatingWhatsApp() {
  const { whatsapp_enabled, whatsapp_url } = useSiteWidgets();

  if (!whatsapp_enabled || !whatsapp_url) return null;

  return (
    <a
      href={whatsapp_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center
                 rounded-full bg-[#25D366] shadow-lg transition-transform hover:scale-105
                 focus:outline-none focus:ring-4 focus:ring-[#25D366]/30"
    >
      {/* Inline mark rather than an image file: it stays sharp at any size and
          needs no network request on a button shown on every page. */}
      <svg viewBox="0 0 32 32" className="h-8 w-8 fill-white" aria-hidden="true">
        <path d="M16.04 4c-6.6 0-11.96 5.36-11.96 11.96 0 2.11.55 4.17 1.6 5.99L4 28l6.22-1.63a11.9 11.9 0 0 0 5.82 1.48h.01c6.6 0 11.96-5.36 11.96-11.96 0-3.2-1.24-6.2-3.5-8.46A11.86 11.86 0 0 0 16.04 4Zm0 21.8h-.01c-1.78 0-3.53-.48-5.05-1.38l-.36-.21-3.75.98 1-3.65-.24-.38a9.86 9.86 0 0 1-1.51-5.25c0-5.48 4.46-9.94 9.95-9.94 2.66 0 5.15 1.04 7.03 2.92a9.87 9.87 0 0 1 2.91 7.03c0 5.49-4.46 9.95-9.94 9.95Zm5.46-7.45c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      </svg>
    </a>
  );
}
