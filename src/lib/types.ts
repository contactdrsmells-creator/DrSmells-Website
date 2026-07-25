export interface ProductVariation {
  name: string;
  price: number;
  sale_price?: number | null;
}

// Multi-attribute variation system (e.g., size + color = 1 price)
export interface VariationAttribute {
  name: string;        // e.g., "Anti-odour cream", "Color"
  options: string[];   // e.g., ["30ml", "50ml"]
}

export interface VariationCombo {
  selections: Record<string, string>;  // e.g., { "Size": "30ml", "Color": "Red" }
  price: number;
  sale_price?: number | null;
  in_stock?: boolean;
}

export interface ProductPageSections {
  value_props_heading?: string;
  value_props_items?: { icon: string; title: string; subtitle: string; icon_url?: string; icon_size?: number }[];
  tell_me_more_image?: string;
  tell_me_more_title?: string;
  tell_me_more_description?: string;
  tell_me_more_faqs?: { question: string; answer: string }[];
  how_it_works_title?: string;
  how_it_works_description?: string;
  how_it_works_video?: string;
  how_to_use_image?: string;
  how_to_use_description?: string;
  ask_us_title?: string;
  ask_us_subtitle?: string;
  ask_us_faq_link?: string;
  ask_us_contact_link?: string;
  ask_us_faqs?: { question: string; answer: string }[];
}

export interface SubscriptionOption {
  interval_months: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price: number;
  sale_price: number | null;
  category: string;
  categories: string[];
  related_products: string[];
  image_url: string | null;
  images: string[];
  sizes: string[];
  variations: ProductVariation[];
  variation_attributes?: VariationAttribute[];
  variation_combos?: VariationCombo[];
  subscription_enabled?: boolean;
  subscription_options?: SubscriptionOption[];
  in_stock: boolean;
  featured: boolean;
  sort_order: number;
  page_sections: ProductPageSections;
}

export interface Testimonial {
  id: string;
  name: string;
  rating: number;
  review: string;
  verified: boolean;
}

export interface Review {
  id: string;
  product_id: string;
  name: string;
  email: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
  verified: boolean;
  approved: boolean;
  created_at: string;
}

export interface HeroBanner {
  id: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  image_url: string | null;
  video_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export interface SiteSettings {
  [key: string]: Record<string, string>;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
  subscription?: {
    interval_months: number;
    price: number;
  } | null;
}

export interface ShippingAddress {
  name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  variation: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: "pending" | "processing" | "paid" | "shipped" | "completed" | "cancelled" | "refunded";
  payment_method: "senangpay" | "stripe" | "doku" | "manual";
  payment_status: "pending" | "paid" | "failed" | "refunded";
  payment_reference?: string;
  source?: string;
  items: OrderItem[];
  shipping: ShippingAddress;
  subtotal: number;
  shipping_cost: number;
  total: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}
