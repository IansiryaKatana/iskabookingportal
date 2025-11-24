-- Add Studio Catalog Hero Image to Branding Settings
-- This allows the hero image on the studio catalog page to be managed dynamically

-- Insert the default hero image setting (using the current hardcoded URL as fallback)
INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description) VALUES
  ('studio_catalog_hero_image', 'https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp', 'url', 'Hero image for the studio catalog page')
ON CONFLICT (setting_key) DO NOTHING;

