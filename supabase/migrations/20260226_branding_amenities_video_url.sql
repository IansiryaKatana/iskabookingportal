-- Add Amenities Video URL to Branding Settings
-- Allows uploading a video for the Amenities section (studio pages) to avoid external URLs and CSP issues.

INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description) VALUES
  ('amenities_video_url', '', 'url', 'Video shown in the Amenities section on studio grade pages. Upload via Admin > Branding to serve from same origin and avoid Content-Security-Policy blocks.')
ON CONFLICT (setting_key) DO NOTHING;
