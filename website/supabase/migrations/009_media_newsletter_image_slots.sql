-- Media management, newsletter, and website image slots.
-- Run after 001-008. Website directory only.

-- ============================================
-- 1. WEBSITE MEDIA LIBRARY (uploaded images - distinct from website_media which is homepage video/covers)
-- ============================================
CREATE TABLE IF NOT EXISTS website_media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'image',
  file_size BIGINT,
  mime_type TEXT,
  alt_text TEXT,
  caption TEXT,
  folder TEXT DEFAULT 'media',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_media_library_type ON website_media_library(file_type);
CREATE INDEX IF NOT EXISTS idx_website_media_library_created ON website_media_library(created_at DESC);

ALTER TABLE website_media_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "website_media_library public read" ON website_media_library FOR SELECT USING (true);
CREATE POLICY "website_media_library staff all" ON website_media_library FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
);
GRANT SELECT ON website_media_library TO anon, authenticated;
GRANT ALL ON website_media_library TO authenticated;

-- ============================================
-- 2. WEBSITE IMAGE SLOTS (configurable hero/bg images)
-- ============================================
CREATE TABLE IF NOT EXISTS website_image_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  file_url TEXT,
  alt_text TEXT,
  fallback_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_website_image_slots_key ON website_image_slots(slot_key);

-- Seed slot keys for all configurable hero/bg images
INSERT INTO website_image_slots (slot_key, display_name, fallback_url)
VALUES
  ('hero_studios_1', 'Studios hero (main)', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp'),
  ('hero_studios_2', 'Studios hero (social)', NULL),
  ('hero_studios_3', 'Studios hero (study)', NULL),
  ('hero_contact', 'Contact page hero', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp'),
  ('hero_faq', 'FAQ page hero', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp'),
  ('hero_reviews', 'Reviews page hero', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp'),
  ('hero_shortterm', 'Short-term page hero', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp'),
  ('hero_privacy', 'Privacy page hero', 'https://images.pexels.com/photos/6593883/pexels-photo-6593883.jpeg?auto=compress&cs=tinysrgb&w=1920'),
  ('hero_terms', 'Terms page hero', 'https://images.pexels.com/photos/6593883/pexels-photo-6593883.jpeg?auto=compress&cs=tinysrgb&w=1920'),
  ('hero_notfound', '404 page hero', 'https://images.pexels.com/photos/325229/pexels-photo-325229.jpeg?auto=compress&cs=tinysrgb&w=1920')
ON CONFLICT (slot_key) DO NOTHING;

-- ============================================
-- 3. NEWSLETTER SUBSCRIBERS
-- ============================================
CREATE TABLE IF NOT EXISTS website_newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'popup',
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_newsletter_subscribers_email ON website_newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_website_newsletter_subscribers_subscribed ON website_newsletter_subscribers(subscribed_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_newsletter_subscribers_active ON website_newsletter_subscribers(unsubscribed_at) WHERE unsubscribed_at IS NULL;

-- ============================================
-- 4. NEWSLETTER POPUP SETTINGS (singleton)
-- ============================================
CREATE TABLE IF NOT EXISTS website_newsletter_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  show_after_seconds INTEGER NOT NULL DEFAULT 5,
  show_once_per_session BOOLEAN NOT NULL DEFAULT true,
  show_once_per_day BOOLEAN NOT NULL DEFAULT false,
  headline TEXT DEFAULT 'Stay Updated',
  subheadline TEXT DEFAULT 'Get the latest news and tips about student life at Urban Hub.',
  button_text TEXT DEFAULT 'Subscribe',
  success_message TEXT DEFAULT 'Thanks for subscribing!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure single row
INSERT INTO website_newsletter_settings (id, is_enabled, show_after_seconds, show_once_per_session, headline, subheadline)
SELECT gen_random_uuid(), true, 5, true, 'Stay Updated', 'Get the latest news and tips about student life at Urban Hub.'
WHERE NOT EXISTS (SELECT 1 FROM website_newsletter_settings LIMIT 1);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE website_image_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_newsletter_settings ENABLE ROW LEVEL SECURITY;

-- website_image_slots: public read, staff write
CREATE POLICY "website_image_slots public read" ON website_image_slots FOR SELECT USING (true);
CREATE POLICY "website_image_slots staff all" ON website_image_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
);

-- newsletter_subscribers: anon can insert (subscribe), staff can read/update/delete
CREATE POLICY "website_newsletter_subscribers anon insert" ON website_newsletter_subscribers
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "website_newsletter_subscribers authenticated insert" ON website_newsletter_subscribers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "website_newsletter_subscribers staff select" ON website_newsletter_subscribers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
  );
CREATE POLICY "website_newsletter_subscribers staff all" ON website_newsletter_subscribers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
  );

-- newsletter_settings: public read (for popup), staff write
CREATE POLICY "website_newsletter_settings public read" ON website_newsletter_settings FOR SELECT USING (true);
CREATE POLICY "website_newsletter_settings staff all" ON website_newsletter_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin', 'admin'))
);

-- Triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_image_slots_updated_at') THEN
    CREATE TRIGGER website_image_slots_updated_at BEFORE UPDATE ON website_image_slots
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_newsletter_subscribers_updated_at') THEN
    CREATE TRIGGER website_newsletter_subscribers_updated_at BEFORE UPDATE ON website_newsletter_subscribers
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_newsletter_settings_updated_at') THEN
    CREATE TRIGGER website_newsletter_settings_updated_at BEFORE UPDATE ON website_newsletter_settings
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
END $$;

-- Grants
GRANT SELECT ON website_image_slots TO anon, authenticated;
GRANT ALL ON website_image_slots TO authenticated;

GRANT INSERT ON website_newsletter_subscribers TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON website_newsletter_subscribers TO authenticated;

GRANT SELECT ON website_newsletter_settings TO anon, authenticated;
GRANT ALL ON website_newsletter_settings TO authenticated;
