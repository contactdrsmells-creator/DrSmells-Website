/**
 * The Shipping & Returns page's wording, as the shop first published it.
 *
 * Shown until the admin saves their own under Site Settings, and used to fill
 * the editor the first time, so the page is never empty and the editor never
 * starts blank. Paragraphs are separated by a blank line.
 */
export interface Policies {
  page_title: string;
  returns_title: string;
  returns_body: string;
  shipping_title: string;
  shipping_body: string;
}

export const defaultPolicies: Policies = {
  page_title: "Shipping & Returns",
  returns_title: "Return & Refund Policy",
  returns_body:
    "We think that you’re going to love our products but in case you don’t, we offer a 30-day money back guarantee on unopened & undamaged box. Please contact our support team at Dr.Smells for instructions. Our customers are responsible for paying for the shipping cost to send back returning product.\n\n" +
    "However, if you find that item delivered to you is damaged or broken, kindly contact our customer care within 5 days of receiving the product. We will then replace the broken box for you.",
  shipping_title: "Shipping Policy",
  shipping_body:
    "Ordered items will only ship to the provided shipping address, we will not be liable in the event of an incorrect shipping address is provided and goods are returned to us, delivery for the second attempt will be charged.\n\n" +
    "If you have any request for change of shipping address, please whatsapp us at 60168961623 before your order had ship out from us. Delivery takes 1 – 3 working days for West Malaysia, 3 – 5 working days for East Malaysia.",
};

/** Saved wording over the defaults, field by field, so a blank field falls back. */
export function withDefaults(saved: Partial<Policies> | null | undefined): Policies {
  const out = { ...defaultPolicies };
  for (const key of Object.keys(out) as (keyof Policies)[]) {
    const v = saved?.[key];
    if (typeof v === "string" && v.trim()) out[key] = v;
  }
  return out;
}
