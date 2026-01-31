-- Website: storage bucket, general SEO settings, page views, and analytics event insert for frontend.
-- Run after 001, 002, 003, 004. Does NOT modify portal tables.

-- ============================================
-- 1. STORAGE BUCKET (website uploads)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website',
  'website',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read for website bucket
CREATE POLICY "website bucket public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'website');

-- Authenticated users (e.g. staff) can upload/update/delete in website bucket
CREATE POLICY "website bucket authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'website');

CREATE POLICY "website bucket authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'website');

CREATE POLICY "website bucket authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'website');

-- ============================================
-- 2. WEBSITE GENERAL SEO SETTINGS (singleton)
-- ============================================
CREATE TABLE IF NOT EXISTS website_seo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'Urban Hub',
  default_meta_title TEXT,
  default_meta_description TEXT,
  default_og_image_url TEXT,
  twitter_handle TEXT DEFAULT '@UrbanHubBooking',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_seo_settings_active ON website_seo_settings(is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_seo_settings_updated_at') THEN
    CREATE TRIGGER website_seo_settings_updated_at BEFORE UPDATE ON website_seo_settings
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
END $$;

-- Ensure single row (singleton)
INSERT INTO website_seo_settings (id, site_name, default_meta_title, default_meta_description, twitter_handle)
SELECT gen_random_uuid(), 'Urban Hub', 'Urban Hub Student Accommodation Preston', 'Modern student accommodation in Preston. Book your studio for the academic year.', '@UrbanHubBooking'
WHERE NOT EXISTS (SELECT 1 FROM website_seo_settings LIMIT 1);

ALTER TABLE website_seo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_seo_settings public read" ON website_seo_settings FOR SELECT USING (true);
CREATE POLICY "website_seo_settings staff all" ON website_seo_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
);

GRANT SELECT ON website_seo_settings TO anon, authenticated;
GRANT ALL ON website_seo_settings TO authenticated;

-- Allow public read of analytics settings so frontend can inject GA/GTM script
CREATE POLICY "website_analytics_settings public read" ON website_analytics_settings FOR SELECT USING (true);

-- Ensure one row for GA settings (admin form expects it)
INSERT INTO website_analytics_settings (id, is_active)
SELECT gen_random_uuid(), true
WHERE NOT EXISTS (SELECT 1 FROM website_analytics_settings LIMIT 1);

-- Allow public read of analytics tags so frontend can attach click tracking
CREATE POLICY "website_analytics_tags public read" ON website_analytics_tags FOR SELECT USING (is_active = true);

-- ============================================
-- 3. PAGE VIEWS (traffic tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS website_analytics_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_page_views_path ON website_analytics_page_views(page_path);
CREATE INDEX IF NOT EXISTS idx_website_analytics_page_views_created ON website_analytics_page_views(created_at DESC);

ALTER TABLE website_analytics_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_analytics_page_views anon insert" ON website_analytics_page_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "website_analytics_page_views authenticated insert" ON website_analytics_page_views FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "website_analytics_page_views staff all" ON website_analytics_page_views FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
);

GRANT INSERT ON website_analytics_page_views TO anon, authenticated;
GRANT ALL ON website_analytics_page_views TO authenticated;

-- ============================================
-- 4. ALLOW FRONTEND TO RECORD EVENTS (anon insert)
-- ============================================
CREATE POLICY "website_analytics_events anon insert" ON website_analytics_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "website_analytics_events authenticated insert" ON website_analytics_events
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT INSERT ON website_analytics_events TO anon, authenticated;
