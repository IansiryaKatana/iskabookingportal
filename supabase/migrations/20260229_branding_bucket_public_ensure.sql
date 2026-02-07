-- Ensure the branding bucket exists and is PUBLIC so amenities video (and other assets) load without auth.
-- If the bucket was ever set to private, getPublicUrl() still returns a URL but it returns 403 in the browser.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('branding', 'branding', true, 104857600)
ON CONFLICT (id) DO UPDATE SET public = true;
