-- Fix Branding System Storage Policies and Grants
-- This migration adds storage policies for the branding bucket and grants for branding tables
-- Policies target storage.objects because storage APIs respect row-level security.

BEGIN;

DO $$
BEGIN
  -- Public read access to branding bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read branding assets'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Public read branding assets"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'branding');
    $sql$;
  END IF;

  -- Staff can upload to branding bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can upload branding assets'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff can upload branding assets"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'branding' 
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can update branding assets
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can update branding assets'
  ) THEN
    EXECUTE $sql$
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
    $sql$;
  END IF;

  -- Staff can delete branding assets
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can delete branding assets'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff can delete branding assets"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'branding' 
          AND public.is_staff()
        );
    $sql$;
  END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- PART 2: GRANTS FOR BRANDING_SETTINGS
-- ============================================================================

-- Grant INSERT and UPDATE to authenticated users (RLS will restrict to staff)
GRANT INSERT, UPDATE ON public.branding_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.navigation_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.opening_hours TO authenticated;

