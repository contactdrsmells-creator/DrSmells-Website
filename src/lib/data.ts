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
 * Hidden products are left out of every browsable listing. They stay reachable
 * by search and by their own link — the point is to sell them without putting
 * them on display.
 *
 * Written as "not true" rather than "is false" so a row predating the column,
 * where it is null, still shows.
 */
const visible = <T extends { hidden?: boolean }>(items: T[]) =>
  items.filter((p) => p.hidden !== true);

export async function getProducts(category?: string): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    if (category) return sampleProducts.filter((p) => p.category === category);
    return sampleProducts;
  }
  let query = supabase.from("products").select("*").order("sort_order");
  if (category) query = query.eq("category", category);
  const { data } = await query;
  return visible((data as Product[]) || []);
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
