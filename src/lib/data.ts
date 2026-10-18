import { supabase } from "./supabase/client";
import { Product, Testimonial, FAQ, HeroBanner } from "./types";
import {
  sampleProducts,
  sampleTestimonials,
  sampleFAQs,
  sampleBanners,
} from "./sample-data";

const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Two ways a product can be off the shop, and they mean different things.
 *
 * Hidden is unlisted: out of every browsable listing, still reachable by
 * search and by its own link. The point is to sell it without putting it on
 * display, which is how the promo products are sold.
 *
 * Deactivated is retired: out of the listings, out of search, and its own link
 * says the item is no longer available. Deleting would do that too, but it
 * takes the reviews with it and loses the record — this keeps both.
 *
 * Written as "not true" rather than "is false" so a row predating either
 * column, where it is null, still shows.
 */
const visible = <T extends { hidden?: boolean; inactive?: boolean }>(items: T[]) =>
  items.filter((p) => p.hidden !== true && p.inactive !== true);

/** Retired, whatever else is true of it. */
export const isRetired = (product: { inactive?: boolean } | null | undefined) =>
  product?.inactive === true;

export async function getProducts(category?: string): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    if (category) return sampleProducts.filter((p) => p.category === category);
    return sampleProducts;
  }
  let query = supabase.from("products").select("*").order("sort_order");
  if (category) query = query.eq("category", category);
  const { data } = await query;

  const items = visible((data as Product[]) || []);
  // Asking for everything means the shop front, which a product can be kept
  // out of while still appearing under its own category.
  return category ? items : items.filter((p) => p.show_in_all !== false);
}

export async function getProduct(slug: string): Promise<Product | null> {
  if (!isSupabaseConfigured) {
    return sampleProducts.find((p) => p.slug === slug) || null;
  }
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single();
  return data as Product | null;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    return sampleProducts.filter((p) => p.featured);
  }
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("featured", true)
    .order("sort_order");
  return visible((data as Product[]) || []);
}

export async function getTestimonials(): Promise<Testimonial[]> {
  if (!isSupabaseConfigured) return sampleTestimonials;
  const { data } = await supabase
    .from("testimonials")
    .select("*")
    .eq("visible", true)
    .order("created_at", { ascending: false });
  return (data as Testimonial[]) || [];
}

export async function getFAQs(): Promise<FAQ[]> {
  if (!isSupabaseConfigured) return sampleFAQs;
  const { data } = await supabase
    .from("faqs")
    .select("*")
    .eq("visible", true)
    .order("sort_order");
  return (data as FAQ[]) || [];
}

export async function getHeroBanners(): Promise<HeroBanner[]> {
  if (!isSupabaseConfigured) return sampleBanners;
  const { data } = await supabase
    .from("hero_banners")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return (data as HeroBanner[]) || [];
}

export async function getSiteImages(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "site_images")
    .single();
  return (data?.value as Record<string, string>) || {};
}

export async function getSiteSettings(): Promise<Record<string, Record<string, string>>> {
  if (!isSupabaseConfigured) {
    return {
      brand: { name: "Dr.Smells", tagline: "Simple . Effective . 100hrs", company: "LIFE BIO LAB SDN. BHD (1452572-P)" },
      contact: { email: "info@drsmells.com.my" },
      social: { facebook: "", instagram: "", tiktok: "", whatsapp: "" },
    };
  }
  const { data } = await supabase.from("site_settings").select("*");
  const settings: Record<string, Record<string, string>> = {};
  data?.forEach((row: { key: string; value: Record<string, string> }) => {
    settings[row.key] = row.value;
  });
  return settings;
}
