-- Fix Studio Media Storage Policies
-- This migration adds storage policies for the studio-media bucket
-- Policies target storage.objects because storage APIs respect row-level security.
-- Studio media should be publicly readable, but only staff can upload/manage.

BEGIN;

DO $$
BEGIN
  -- Public read access to studio-media bucket (for displaying studio images)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Public read studio media"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'studio-media');
    $sql$;
  END IF;

  -- Staff can upload to studio-media bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can upload studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff can upload studio media"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'studio-media' 
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can update studio media
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can update studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff can update studio media"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'studio-media' 
          AND public.is_staff()
        )
        WITH CHECK (
          bucket_id = 'studio-media' 
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can delete studio media
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff can delete studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff can delete studio media"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'studio-media' 
          AND public.is_staff()
        );
    $sql$;
  END IF;
END;
$$;

COMMIT;

