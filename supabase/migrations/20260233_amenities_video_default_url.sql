-- Set default amenities video to Supabase storage (no upload/back-and-forth needed)
UPDATE public.branding_settings
SET setting_value = 'https://pzptocwdaqpczexlbajr.supabase.co/storage/v1/object/public/branding/amenities-video.mp4',
    updated_at = NOW()
WHERE setting_key = 'amenities_video_url';

INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'amenities_video_url',
  'https://pzptocwdaqpczexlbajr.supabase.co/storage/v1/object/public/branding/amenities-video.mp4',
  'url',
  'Video shown in the Amenities section on studio grade pages. Served from Supabase storage.'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();
