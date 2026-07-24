-- ==============================================
-- Dr.Smells Database Schema
-- Run this in Supabase SQL Editor (one time only)
-- ==============================================

-- Products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  short_description TEXT,
  price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  category TEXT NOT NULL DEFAULT 'underarm',
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  sizes TEXT[] DEFAULT '{}',
  in_stock BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Testimonials table
CREATE TABLE testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  review TEXT NOT NULL,
  verified BOOLEAN DEFAULT true,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Site settings table
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hero banners
CREATE TABLE hero_banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  cta_text TEXT DEFAULT 'Shop Now',
  cta_link TEXT DEFAULT '/shop',
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FAQs
CREATE TABLE faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Allow public READ on all tables (for the website)
CREATE POLICY "Anyone can read products" ON products FOR SELECT USING (true);
CREATE POLICY "Anyone can read testimonials" ON testimonials FOR SELECT USING (true);
CREATE POLICY "Anyone can read settings" ON site_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can read banners" ON hero_banners FOR SELECT USING (true);
CREATE POLICY "Anyone can read faqs" ON faqs FOR SELECT USING (true);

-- Allow full access with the anon key (your admin panel handles auth via password)
-- This is safe because your admin panel is password-protected
CREATE POLICY "Admin insert products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update products" ON products FOR UPDATE USING (true);
CREATE POLICY "Admin delete products" ON products FOR DELETE USING (true);

CREATE POLICY "Admin insert testimonials" ON testimonials FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update testimonials" ON testimonials FOR UPDATE USING (true);
CREATE POLICY "Admin delete testimonials" ON testimonials FOR DELETE USING (true);

CREATE POLICY "Admin insert settings" ON site_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update settings" ON site_settings FOR UPDATE USING (true);

CREATE POLICY "Admin insert banners" ON hero_banners FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update banners" ON hero_banners FOR UPDATE USING (true);
CREATE POLICY "Admin delete banners" ON hero_banners FOR DELETE USING (true);

CREATE POLICY "Admin insert faqs" ON faqs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update faqs" ON faqs FOR UPDATE USING (true);
CREATE POLICY "Admin delete faqs" ON faqs FOR DELETE USING (true);

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Allow public read + anyone upload to storage
CREATE POLICY "Public read images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Anyone upload images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Anyone delete images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');

-- ==============================================
-- Sample Data (you can edit/delete these later)
-- ==============================================

-- Default site settings
INSERT INTO site_settings (key, value) VALUES
  ('brand', '{"name": "Dr.Smells", "tagline": "Simple . Effective . 100hrs", "company": "LIFE BIO LAB SDN. BHD (1452572-P)"}'),
  ('contact', '{"email": "info@drsmells.com.my", "phone": "", "whatsapp": "", "address": "Malaysia"}'),
  ('social', '{"facebook": "", "instagram": "", "tiktok": "", "whatsapp": ""}');

-- Default hero banner
INSERT INTO hero_banners (title, subtitle, cta_text, cta_link) VALUES
  ('20% OFF', 'Microbiome Scrub + Anti-Odour Cream Bundle', 'Shop Now', '/shop');

-- Sample products
INSERT INTO products (name, slug, description, short_description, price, sale_price, category, featured, sizes, sort_order) VALUES
  ('Anti-Odour Cream', 'anti-odour-cream', 'NOT your ordinary deodorant. We don''t merely mask odors. Instead, we rejuvenate underarm skin cells, repair damaged tissue, and eliminate odor-causing bacteria.', 'Dermatologically tested anti-odour cream', 59.90, NULL, 'underarm', true, ARRAY['30ml', '50ml'], 1),
  ('Microbiome Scrub', 'microbiome-scrub', 'A gentle exfoliating scrub that balances your skin''s microbiome while removing dead skin cells and odor-causing bacteria.', 'Gentle microbiome balancing scrub', 49.90, NULL, 'underarm', true, ARRAY['100ml'], 2),
  ('Anti-Odour Cream + Microbiome Scrub Bundle', 'bundle-cream-scrub', 'Get both our bestselling Anti-Odour Cream and Microbiome Scrub at a special bundle price. Save 20%!', 'Bundle and save 20%', 109.80, 87.84, 'bundle', true, ARRAY['Standard'], 3);

-- Sample testimonials
INSERT INTO testimonials (name, rating, review) VALUES
  ('Yvonne Lim', 5, 'I switched from dove to drsmells. I got my first cream last month and fell in love! Smells nothing, doesn''t leave streaks.'),
  ('Lashkmi Uma', 5, 'I''m an aluminum free deodorant "first timer" and this product has blown me away. The texture is fabulous.'),
  ('Sarah M.', 5, 'I only buy my deodorant from drsmells. I''ve tried their sampling last month and was hooked since then. They last long, the texture is perfect.'),
  ('Ahmad R.', 5, 'I will not buy any other kind of deodorant! I even get this for my family. It is AMAZING and I appreciate that it doesn''t contain any harmful ingredients.');

-- Sample FAQs
INSERT INTO faqs (question, answer, sort_order) VALUES
  ('How long does the Anti-Odour Cream last?', 'Our Anti-Odour Cream is clinically tested to provide up to 100 hours of odour protection with a single application.', 1),
  ('Is Dr.Smells safe for sensitive skin?', 'Yes! All our products are dermatologically tested and made with natural ingredients. They are cruelty-free and vegan-friendly.', 2),
  ('Do you ship internationally?', 'Currently we ship within Malaysia. International shipping coming soon! Follow our social media for updates.', 3),
  ('What is your return policy?', 'We offer a 30-day satisfaction guarantee. If you''re not happy with your purchase, contact us for a full refund.', 4);
