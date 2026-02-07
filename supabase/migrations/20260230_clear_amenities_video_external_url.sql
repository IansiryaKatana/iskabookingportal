-- Clear the old external amenities video URL so the app stops requesting it (CORS blocks it from localhost/production).
-- After this, upload the video again in Admin > Branding or paste the Supabase storage URL and Save.

UPDATE public.branding_settings
SET setting_value = '', updated_at = NOW()
WHERE setting_key = 'amenities_video_url'
  AND (setting_value LIKE '%urbanhub.uk%' OR setting_value LIKE '%URBAN-HUB-low-all-amenities%');
