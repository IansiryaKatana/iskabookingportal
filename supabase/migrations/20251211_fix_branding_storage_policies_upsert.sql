-- Fix Branding Storage Policies for Upsert Operations
-- This migration ensures branding storage policies work correctly with upsert operations
-- The issue is that upsert operations need both INSERT and UPDATE policies to work

BEGIN;

DO $$
BEGIN
  -- Drop existing policies if they exist (to recreate them properly)
  DROP POLICY IF EXISTS "Public read branding assets" ON storage.objects;
  DROP POLICY IF EXISTS "Staff can upload branding assets" ON storage.objects;
  DROP POLICY IF EXISTS "Staff can update branding assets" ON storage.objects;
  DROP POLICY IF EXISTS "Staff can delete branding assets" ON storage.objects;

  -- Public read access to branding bucket
  CREATE POLICY "Public read branding assets"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'branding');

  -- Staff can upload to branding bucket
  -- This policy allows INSERT operations
  CREATE POLICY "Staff can upload branding assets"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'branding' 
      AND public.is_staff()
    );

  -- Staff can update branding assets
  -- This policy allows UPDATE operations (needed for upsert)
  CREATE POLICY "Staff can update branding assets"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'branding' 
      AND public.is_staff()
    )
    WITH CHECK (
      bucket_id = 'branding' 
      AND public.is_staff()
    );

  -- Staff can delete branding assets
  CREATE POLICY "Staff can delete branding assets"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'branding' 
      AND public.is_staff()
    );
END;
$$;

COMMIT;

