-- Configure Google Analytics (G-ZWBWT1PJQL) and Tag Manager (GTM-M2V5FHT5) for urbanhub.uk
-- Seed all tracked elements for website analytics

-- ============================================
-- 1. UPDATE ANALYTICS SETTINGS
-- ============================================
UPDATE website_analytics_settings
SET
  google_analytics_id = 'G-ZWBWT1PJQL',
  google_tag_manager_id = 'GTM-M2V5FHT5',
  is_active = true,
  updated_at = now()
WHERE id = (SELECT id FROM website_analytics_settings LIMIT 1);

-- If no row exists, insert one
INSERT INTO website_analytics_settings (id, google_analytics_id, google_tag_manager_id, is_active)
SELECT gen_random_uuid(), 'G-ZWBWT1PJQL', 'GTM-M2V5FHT5', true
WHERE NOT EXISTS (SELECT 1 FROM website_analytics_settings LIMIT 1);

-- ============================================
-- 2. SEED TRACKED ELEMENTS
-- ============================================
INSERT INTO website_analytics_tags (tag_name, element_selector, event_name, category, is_active)
VALUES
  ('Get a Callback', '[data-analytics="nav-callback"]', 'cta_click', 'navigation', true),
  ('Book Viewing', '[data-analytics="nav-book-viewing"]', 'cta_click', 'navigation', true),
  ('Mobile Menu', '[data-analytics="nav-menu"]', 'menu_open', 'navigation', true),
  ('Logo Click', '[data-analytics="logo"]', 'logo_click', 'navigation', true),
  ('Back to Top', '[data-analytics="back-to-top"]', 'back_to_top', 'utility', true),
  ('VR Explore', '[data-analytics="vr-explore"]', 'vr_click', 'utility', true),
  ('WhatsApp', '[data-analytics="whatsapp"]', 'whatsapp_click', 'contact', true),
  ('Callback Form Submit', '[data-analytics="form-callback-submit"]', 'form_submit', 'conversion', true),
  ('Viewing Form Submit', '[data-analytics="form-viewing-submit"]', 'form_submit', 'conversion', true),
  ('Contact Form Submit', '[data-analytics="form-contact-submit"]', 'form_submit', 'conversion', true),
  ('Newsletter Subscribe', '[data-analytics="newsletter-subscribe"]', 'newsletter_signup', 'conversion', true),
  ('Short-term Book CTA', '[data-analytics="short-term-book"]', 'cta_click', 'conversion', true),
  ('Short-term Tourist', '[data-analytics="short-term-tourist"]', 'shortterm_tourist', 'conversion', true),
  ('Short-term Keyworker', '[data-analytics="short-term-keyworker"]', 'shortterm_keyworker', 'conversion', true),
  ('Short-term Form Submit', '[data-analytics="form-shortterm-submit"]', 'form_submit', 'conversion', true),
  ('Add Review Submit', '[data-analytics="form-review-submit"]', 'form_submit', 'engagement', true),
  ('Studios Hero Book Viewing', '[data-analytics="studios-hero-viewing"]', 'cta_click', 'conversion', true),
  ('Contact Phone', '[data-analytics="contact-phone"]', 'phone_click', 'contact', true),
  ('Contact WhatsApp', '[data-analytics="contact-whatsapp"]', 'whatsapp_click', 'contact', true),
  ('Grade Book Now', '[data-analytics="grade-book-now"]', 'book_now_click', 'conversion', true)
ON CONFLICT (tag_name) DO UPDATE SET
  element_selector = EXCLUDED.element_selector,
  event_name = EXCLUDED.event_name,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();
