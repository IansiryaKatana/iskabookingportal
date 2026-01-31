-- Add optional og_image_alt and twitter_image_alt columns to seo_pages for better social sharing accessibility.
-- Run after 001-007.

ALTER TABLE seo_pages
  ADD COLUMN IF NOT EXISTS og_image_alt TEXT,
  ADD COLUMN IF NOT EXISTS twitter_image_alt TEXT;

COMMENT ON COLUMN seo_pages.og_image_alt IS 'Alt text for OG image when shared on social (og:image:alt)';
COMMENT ON COLUMN seo_pages.twitter_image_alt IS 'Alt text for Twitter image when shared (optional)';
