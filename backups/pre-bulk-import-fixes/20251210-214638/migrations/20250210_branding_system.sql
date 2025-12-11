-- Branding System Migration
-- Creates tables for managing logo, favicon, navigation items, contact info, opening hours, and footer content

-- ============================================================================
-- PART 1: BRANDING SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'url', 'file_path'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branding_settings_key ON public.branding_settings(setting_key);

DROP TRIGGER IF EXISTS set_timestamp_branding_settings ON public.branding_settings;
CREATE TRIGGER set_timestamp_branding_settings
BEFORE UPDATE ON public.branding_settings
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 2: NAVIGATION ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  location TEXT NOT NULL DEFAULT 'header', -- 'header' or 'footer'
  opens_in_new_tab BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_navigation_items_location ON public.navigation_items(location, is_active);
CREATE INDEX IF NOT EXISTS idx_navigation_items_order ON public.navigation_items(location, display_order);

DROP TRIGGER IF EXISTS set_timestamp_navigation_items ON public.navigation_items;
CREATE TRIGGER set_timestamp_navigation_items
BEFORE UPDATE ON public.navigation_items
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 3: OPENING HOURS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.opening_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_name TEXT NOT NULL UNIQUE, -- 'Monday', 'Tuesday', etc.
  day_order INTEGER NOT NULL, -- 1-7 for Mon-Sun
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  special_note TEXT, -- e.g., "Emergency contact available 24/7"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT opening_hours_day_order_check CHECK (day_order >= 1 AND day_order <= 7)
);

CREATE INDEX IF NOT EXISTS idx_opening_hours_order ON public.opening_hours(day_order);

DROP TRIGGER IF EXISTS set_timestamp_opening_hours ON public.opening_hours;
CREATE TRIGGER set_timestamp_opening_hours
BEFORE UPDATE ON public.opening_hours
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 4: RLS POLICIES
-- ============================================================================

ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_hours ENABLE ROW LEVEL SECURITY;

-- Public read access for branding settings
DROP POLICY IF EXISTS "Public can read branding settings" ON public.branding_settings;
CREATE POLICY "Public can read branding settings" ON public.branding_settings
  FOR SELECT USING (true);

-- Staff can manage branding settings
DROP POLICY IF EXISTS "Staff can manage branding settings" ON public.branding_settings;
CREATE POLICY "Staff can manage branding settings" ON public.branding_settings
  FOR ALL USING (public.is_staff());

-- Public read access for navigation items
DROP POLICY IF EXISTS "Public can read active navigation items" ON public.navigation_items;
CREATE POLICY "Public can read active navigation items" ON public.navigation_items
  FOR SELECT USING (is_active = true);

-- Staff can manage navigation items
DROP POLICY IF EXISTS "Staff can manage navigation items" ON public.navigation_items;
CREATE POLICY "Staff can manage navigation items" ON public.navigation_items
  FOR ALL USING (public.is_staff());

-- Public read access for opening hours
DROP POLICY IF EXISTS "Public can read opening hours" ON public.opening_hours;
CREATE POLICY "Public can read opening hours" ON public.opening_hours
  FOR SELECT USING (true);

-- Staff can manage opening hours
DROP POLICY IF EXISTS "Staff can manage opening hours" ON public.opening_hours;
CREATE POLICY "Staff can manage opening hours" ON public.opening_hours
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 5: SEED INITIAL DATA
-- ============================================================================

-- Seed branding settings with current hardcoded values
INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description) VALUES
  ('logo_path', '/assets/urban-hub-logo.webp', 'file_path', 'Main logo file path'),
  ('favicon_path', '/favicon.png', 'file_path', 'Favicon file path'),
  ('footer_description', 'Premium student accommodation designed for modern living and academic success.', 'text', 'Footer description text'),
  ('footer_copyright_text', 'Urban Hub. All rights reserved.', 'text', 'Footer copyright text (year will be added automatically)'),
  ('contact_phone', '+44 123 456 7890', 'text', 'Contact phone number'),
  ('contact_email', 'info@urbanhub.uk', 'text', 'Contact email address'),
  ('contact_address_line1', '123 Student Street', 'text', 'Address line 1'),
  ('contact_address_line2', 'City Centre', 'text', 'Address line 2'),
  ('contact_address_line3', 'Preston, PR1 1AA', 'text', 'Address line 3 and postcode'),
  ('emergency_contact_text', 'Emergency contact available 24/7', 'text', 'Emergency contact note')
ON CONFLICT (setting_key) DO NOTHING;

-- Seed header navigation items
INSERT INTO public.navigation_items (title, url, display_order, location, is_active) VALUES
  ('HOME', '#', 1, 'header', true),
  ('ABOUT', '#', 2, 'header', true),
  ('FAQ', '#', 3, 'header', true),
  ('BLOG', '#', 4, 'header', true),
  ('CONTACT', '#', 5, 'header', true)
ON CONFLICT DO NOTHING;

-- Seed footer quick links
INSERT INTO public.navigation_items (title, url, display_order, location, is_active) VALUES
  ('Home', '#', 1, 'footer', true),
  ('About Us', '#', 2, 'footer', true),
  ('FAQ', '#', 3, 'footer', true),
  ('Blog', '#', 4, 'footer', true)
ON CONFLICT DO NOTHING;

-- Seed opening hours
INSERT INTO public.opening_hours (day_name, day_order, open_time, close_time, is_closed, special_note) VALUES
  ('Monday', 1, '09:00', '18:00', false, NULL),
  ('Tuesday', 2, '09:00', '18:00', false, NULL),
  ('Wednesday', 3, '09:00', '18:00', false, NULL),
  ('Thursday', 4, '09:00', '18:00', false, NULL),
  ('Friday', 5, '09:00', '18:00', false, NULL),
  ('Saturday', 6, '10:00', '16:00', false, NULL),
  ('Sunday', 7, NULL, NULL, true, 'Emergency contact available 24/7')
ON CONFLICT (day_name) DO NOTHING;

-- ============================================================================
-- PART 6: GRANTS
-- ============================================================================

GRANT SELECT ON public.branding_settings TO authenticated, anon;
GRANT SELECT ON public.navigation_items TO authenticated, anon;
GRANT SELECT ON public.opening_hours TO authenticated, anon;

-- ============================================================================
-- PART 7: STORAGE BUCKET
-- ============================================================================

-- Create branding storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.branding_settings IS 'Stores branding assets paths and text content (logo, favicon, contact info, footer text)';
COMMENT ON TABLE public.navigation_items IS 'Stores navigation items for header and footer with ordering and active status';
COMMENT ON TABLE public.opening_hours IS 'Stores structured opening hours for each day of the week';

