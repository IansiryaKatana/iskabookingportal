-- Website tables: amenities, why-us, media, studio grade features, FAQs, form submissions,
-- reviews, activity log, analytics. All prefixed website_ for schema segregation.
-- Run against same Supabase project as portal.
--
-- SAFETY: This migration does NOT alter any existing portal/system tables. It only:
--   - Creates new tables (website_*). No ALTER/DROP/TRUNCATE on portal tables.
--   - Adds foreign keys FROM website_* TO existing tables (studio_grades, auth.users, blog_posts).
--   Referencing another table does not modify that table. Your portal schema stays unchanged.

-- ============================================
-- 1. WEBSITE AMENITIES (title, short desc, photos; homepage=vertical, about=horizontal)
-- ============================================
CREATE TABLE IF NOT EXISTS website_amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  short_description TEXT,
  vertical_image_url TEXT,
  horizontal_image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_amenities_order ON website_amenities(display_order);
CREATE INDEX IF NOT EXISTS idx_website_amenities_active ON website_amenities(is_active);

-- Photos (min 2 per amenity) - separate table for multiple images
CREATE TABLE IF NOT EXISTS website_amenity_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amenity_id UUID NOT NULL REFERENCES website_amenities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_amenity_photos_amenity ON website_amenity_photos(amenity_id);

-- ============================================
-- 2. WHY US CARDS (icon, title, description)
-- ============================================
CREATE TABLE IF NOT EXISTS website_why_us_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icon TEXT,
  icon_url TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_why_us_cards_order ON website_why_us_cards(display_order);

-- ============================================
-- 3. WEBSITE MEDIA (title, subtitle, video, cover desktop/mobile)
-- ============================================
CREATE TABLE IF NOT EXISTS website_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  media_type TEXT NOT NULL DEFAULT 'video',
  video_url TEXT,
  cover_image_desktop_url TEXT,
  cover_image_mobile_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_media_type_check CHECK (media_type IN ('video', 'image'))
);

CREATE INDEX IF NOT EXISTS idx_website_media_order ON website_media(display_order);

-- ============================================
-- 4. ROOM GRADE BULLET POINTS (website-specific; pricing stays from portal)
-- ============================================
CREATE TABLE IF NOT EXISTS website_studio_grade_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_grade_id UUID NOT NULL REFERENCES public.studio_grades(id) ON DELETE CASCADE,
  feature_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_studio_grade_features_grade ON website_studio_grade_features(studio_grade_id);
CREATE INDEX IF NOT EXISTS idx_website_studio_grade_features_order ON website_studio_grade_features(studio_grade_id, display_order);

-- ============================================
-- 5. FAQs
-- ============================================
CREATE TABLE IF NOT EXISTS website_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_faqs_category ON website_faqs(category);
CREATE INDEX IF NOT EXISTS idx_website_faqs_order ON website_faqs(display_order);

-- ============================================
-- 6. FORM SUBMISSIONS (contact, callback, viewing, inquiry, short_term)
-- ============================================
CREATE TABLE IF NOT EXISTS website_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES auth.users(id),
  read_at TIMESTAMPTZ,
  read_by UUID REFERENCES auth.users(id),
  replied_at TIMESTAMPTZ,
  replied_by UUID REFERENCES auth.users(id),
  notes TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_form_type_check CHECK (form_type IN ('contact', 'callback', 'viewing', 'inquiry', 'short_term')),
  CONSTRAINT website_form_status_check CHECK (status IN ('new', 'read', 'replied', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_website_form_submissions_type ON website_form_submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_website_form_submissions_status ON website_form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_website_form_submissions_created ON website_form_submissions(created_at DESC);

-- ============================================
-- 7. REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS website_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  featured BOOLEAN NOT NULL DEFAULT false,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  verified_purchase BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_reviews_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_website_reviews_status ON website_reviews(status);
CREATE INDEX IF NOT EXISTS idx_website_reviews_rating ON website_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_website_reviews_created ON website_reviews(created_at DESC);

-- ============================================
-- 8. BLOG POST COMMENTS (if not already in 001)
-- ============================================
CREATE TABLE IF NOT EXISTS website_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES website_post_comments(id),
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_website TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_address INET,
  user_agent TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_post_comments_status_check CHECK (status IN ('pending', 'approved', 'spam', 'trash'))
);

CREATE INDEX IF NOT EXISTS idx_website_post_comments_post ON website_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_website_post_comments_status ON website_post_comments(status);

-- ============================================
-- 9. ANALYTICS TAGS (button tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS website_analytics_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT UNIQUE NOT NULL,
  element_selector TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT 'button_click',
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  element_id TEXT,
  element_text TEXT,
  page_path TEXT NOT NULL,
  metadata JSONB,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_events_page ON website_analytics_events(page_path);
CREATE INDEX IF NOT EXISTS idx_website_analytics_events_created ON website_analytics_events(created_at DESC);

-- ============================================
-- 10. WEBSITE ACTIVITY LOG (admin actions)
-- ============================================
CREATE TABLE IF NOT EXISTS website_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_activity_logs_user ON website_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_website_activity_logs_entity ON website_activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_website_activity_logs_created ON website_activity_logs(created_at DESC);

-- ============================================
-- 11. GOOGLE ANALYTICS SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS website_analytics_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_analytics_id TEXT,
  google_tag_manager_id TEXT,
  view_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT,
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION website_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_amenities_updated_at') THEN
    CREATE TRIGGER website_amenities_updated_at BEFORE UPDATE ON website_amenities
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_why_us_cards_updated_at') THEN
    CREATE TRIGGER website_why_us_cards_updated_at BEFORE UPDATE ON website_why_us_cards
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_media_updated_at') THEN
    CREATE TRIGGER website_media_updated_at BEFORE UPDATE ON website_media
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_studio_grade_features_updated_at') THEN
    CREATE TRIGGER website_studio_grade_features_updated_at BEFORE UPDATE ON website_studio_grade_features
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_faqs_updated_at') THEN
    CREATE TRIGGER website_faqs_updated_at BEFORE UPDATE ON website_faqs
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_form_submissions_updated_at') THEN
    CREATE TRIGGER website_form_submissions_updated_at BEFORE UPDATE ON website_form_submissions
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_reviews_updated_at') THEN
    CREATE TRIGGER website_reviews_updated_at BEFORE UPDATE ON website_reviews
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_post_comments_updated_at') THEN
    CREATE TRIGGER website_post_comments_updated_at BEFORE UPDATE ON website_post_comments
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_analytics_tags_updated_at') THEN
    CREATE TRIGGER website_analytics_tags_updated_at BEFORE UPDATE ON website_analytics_tags
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'website_analytics_settings_updated_at') THEN
    CREATE TRIGGER website_analytics_settings_updated_at BEFORE UPDATE ON website_analytics_settings
      FOR EACH ROW EXECUTE FUNCTION website_update_updated_at();
  END IF;
END $$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE website_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_amenity_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_why_us_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_studio_grade_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analytics_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analytics_settings ENABLE ROW LEVEL SECURITY;

-- Public read for content tables
CREATE POLICY "website_amenities public read" ON website_amenities FOR SELECT USING (is_active = true);
CREATE POLICY "website_amenity_photos public read" ON website_amenity_photos FOR SELECT USING (true);
CREATE POLICY "website_why_us_cards public read" ON website_why_us_cards FOR SELECT USING (is_active = true);
CREATE POLICY "website_media public read" ON website_media FOR SELECT USING (is_active = true);
CREATE POLICY "website_studio_grade_features public read" ON website_studio_grade_features FOR SELECT USING (is_active = true);
CREATE POLICY "website_faqs public read" ON website_faqs FOR SELECT USING (is_active = true);
CREATE POLICY "website_reviews public read" ON website_reviews FOR SELECT USING (status = 'approved');

-- Form submissions: anon can insert (form submit), authenticated staff/website_admin can read/update
CREATE POLICY "website_form_submissions anon insert" ON website_form_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "website_form_submissions authenticated insert" ON website_form_submissions FOR INSERT TO authenticated WITH CHECK (true);

-- Website admin: staff and superadmin can manage all website_* tables
-- Use existing is_staff() or (role = 'superadmin') from portal; add website_admin etc. in app layer
CREATE POLICY "website_amenities staff all" ON website_amenities FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_amenity_photos staff all" ON website_amenity_photos FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_why_us_cards staff all" ON website_why_us_cards FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_media staff all" ON website_media FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_studio_grade_features staff all" ON website_studio_grade_features FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_faqs staff all" ON website_faqs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_form_submissions staff all" ON website_form_submissions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_reviews staff all" ON website_reviews FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_post_comments staff all" ON website_post_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_analytics_tags staff all" ON website_analytics_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_analytics_events staff all" ON website_analytics_events FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_activity_logs staff all" ON website_activity_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);
CREATE POLICY "website_analytics_settings staff all" ON website_analytics_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'superadmin'))
);

-- Post comments: public can insert (submit comment), public read only approved
CREATE POLICY "website_post_comments public read approved" ON website_post_comments FOR SELECT USING (status = 'approved');
CREATE POLICY "website_post_comments anon insert" ON website_post_comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "website_post_comments authenticated insert" ON website_post_comments FOR INSERT TO authenticated WITH CHECK (true);

-- Grant usage
GRANT SELECT ON website_amenities TO anon, authenticated;
GRANT SELECT ON website_amenity_photos TO anon, authenticated;
GRANT SELECT ON website_why_us_cards TO anon, authenticated;
GRANT SELECT ON website_media TO anon, authenticated;
GRANT SELECT ON website_studio_grade_features TO anon, authenticated;
GRANT SELECT ON website_faqs TO anon, authenticated;
GRANT SELECT ON website_reviews TO anon, authenticated;
GRANT SELECT ON website_post_comments TO anon, authenticated;
GRANT INSERT ON website_form_submissions TO anon, authenticated;
GRANT INSERT ON website_post_comments TO anon, authenticated;
GRANT ALL ON website_amenities TO authenticated;
GRANT ALL ON website_amenity_photos TO authenticated;
GRANT ALL ON website_why_us_cards TO authenticated;
GRANT ALL ON website_media TO authenticated;
GRANT ALL ON website_studio_grade_features TO authenticated;
GRANT ALL ON website_faqs TO authenticated;
GRANT ALL ON website_form_submissions TO authenticated;
GRANT ALL ON website_reviews TO authenticated;
GRANT ALL ON website_post_comments TO authenticated;
GRANT ALL ON website_analytics_tags TO authenticated;
GRANT ALL ON website_analytics_events TO authenticated;
GRANT ALL ON website_activity_logs TO authenticated;
GRANT ALL ON website_analytics_settings TO authenticated;
