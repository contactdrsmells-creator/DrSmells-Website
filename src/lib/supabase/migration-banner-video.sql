-- Add video_url column to hero_banners table
ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;
