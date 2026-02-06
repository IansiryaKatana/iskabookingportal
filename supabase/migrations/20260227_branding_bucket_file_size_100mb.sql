-- Allow branding bucket to accept file uploads up to 100MB (amenities video).
-- If you still get "object exceeded the maximum allowed size", raise the
-- Global file size limit in Supabase Dashboard: Storage → Configuration → Global file size limit
-- (Free tier max is 50MB; Pro/Team can set up to 500GB.)

UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100 * 1024 * 1024 bytes = 100MB
WHERE id = 'branding';
