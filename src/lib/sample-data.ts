import { Product, Testimonial, FAQ, HeroBanner } from "./types";

// Sample data used when Supabase is not yet configured
export const sampleProducts: Product[] = [
  {
    id: "1",
    name: "Anti-Odour Cream",
    slug: "anti-odour-cream",
    description:
      "NOT your ordinary deodorant. We don't merely mask odors. Instead, we rejuvenate underarm skin cells, repair damaged tissue, and eliminate odor-causing bacteria.",
    short_description: "Dermatologically tested anti-odour cream",
    price: 59.9,
    sale_price: null,
    category: "underarm",
    categories: ["underarm"],
    related_products: ["2", "3"],
    image_url: null,
    images: [],
    sizes: ["30ml", "50ml"],
    variations: [
      { name: "30ml", price: 49.9, sale_price: null },
      { name: "50ml", price: 59.9, sale_price: null },
    ],
    in_stock: true,
    featured: true,
    sort_order: 0,
    page_sections: {},
  },
  {
    id: "2",
    name: "Microbiome Scrub",
    slug: "microbiome-scrub",
    description:
      "A gentle exfoliating scrub that balances your skin's microbiome while removing dead skin cells and odor-causing bacteria.",
    short_description: "Gentle microbiome balancing scrub",
    price: 49.9,
    sale_price: null,
    category: "underarm",
    categories: ["underarm"],
    related_products: ["1", "3"],
    image_url: null,
    images: [],
    sizes: ["100ml"],
    variations: [{ name: "100ml", price: 49.9, sale_price: null }],
    in_stock: true,
    featured: true,
    sort_order: 1,
    page_sections: {},
  },
  {
    id: "3",
    name: "Anti-Odour Cream + Microbiome Scrub Bundle",
    slug: "bundle-cream-scrub",
    description:
      "Get both our bestselling Anti-Odour Cream and Microbiome Scrub at a special bundle price. Save 20%!",
    short_description: "Bundle and save 20%",
    price: 109.8,
    sale_price: 87.84,
    category: "bundle",
    categories: ["bundle"],
    related_products: ["1", "2"],
    image_url: null,
    images: [],
    sizes: ["Standard"],
    variations: [{ name: "Standard", price: 109.8, sale_price: 87.84 }],
    in_stock: true,
    featured: true,
    sort_order: 2,
    page_sections: {},
  },
];

export const sampleTestimonials: Testimonial[] = [
  {
    id: "1",
    name: "Sarah M.",
    rating: 5,
    review:
      "I've been using the Anti-Odour Cream for 3 months now and I can't believe the difference. It truly lasts the full 100 hours they claim!",
    verified: true,
  },
  {
    id: "2",
    name: "Ahmad R.",
    rating: 5,
    review:
      "Finally a product that actually works. The texture is amazing and it doesn't stain my clothes. Highly recommend!",
    verified: true,
  },
  {
    id: "3",
    name: "Lisa T.",
    rating: 5,
    review:
      "As someone who has tried everything, Dr.Smells is a game changer. Natural ingredients and it really works. Love it!",
    verified: true,
  },
];

export const sampleFAQs: FAQ[] = [
  {
    id: "1",
    question: "How long does the Anti-Odour Cream last?",
    answer:
      "Our Anti-Odour Cream is clinically tested to provide up to 100 hours of odour protection with a single application.",
    sort_order: 1,
  },
  {
    id: "2",
    question: "Is Dr.Smells safe for sensitive skin?",
    answer:
      "Yes! All our products are dermatologically tested and made with natural ingredients. They are cruelty-free and vegan-friendly.",
    sort_order: 2,
  },
  {
    id: "3",
    question: "Do you ship internationally?",
    answer:
      "Currently we ship within Malaysia. International shipping coming soon! Follow our social media for updates.",
    sort_order: 3,
  },
  {
    id: "4",
    question: "What is your return policy?",
    answer:
      "We offer a 30-day satisfaction guarantee. If you're not happy with your purchase, contact us for a full refund.",
    sort_order: 4,
  },
];

export const sampleBanners: HeroBanner[] = [
  {
    id: "1",
    title: "20% OFF",
    subtitle: "Microbiome Scrub + Anti-Odour Cream Bundle",
    cta_text: "Shop Now",
    cta_link: "/shop",
    image_url: null,
    video_url: null,
    active: true,
    sort_order: 0,
  },
];
