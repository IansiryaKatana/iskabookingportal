-- ============================================================================
-- STORAGE POLICIES SETUP
-- ============================================================================
-- Run this SQL directly in Supabase Dashboard > SQL Editor
-- Storage policies cannot be created via migrations due to permission restrictions
-- ============================================================================

BEGIN;

DO $$
BEGIN
  -- ============================================================================
  -- MAINTENANCE IMAGES BUCKET POLICIES
  -- ============================================================================

  -- Students can upload images to maintenance-images bucket
  -- Path format: {user_id}/{uuid}.{ext}
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Students upload maintenance images'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Students upload maintenance images"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'maintenance-images'
          AND split_part(name, '/', 1) = auth.uid()::text
        );
    $sql$;
  END IF;

  -- Students can view their own maintenance request images
  -- Staff can view all images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Students view own maintenance images'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Students view own maintenance images"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'maintenance-images'
          AND (
            split_part(name, '/', 1) = auth.uid()::text
            OR public.is_staff()
          )
        );
    $sql$;
  END IF;

  -- Staff can manage all maintenance images
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff manage maintenance images'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff manage maintenance images"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (
          bucket_id = 'maintenance-images'
          AND public.is_staff()
        )
        WITH CHECK (
          bucket_id = 'maintenance-images'
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- ============================================================================
  -- EXPENSE RECEIPTS BUCKET POLICIES
  -- ============================================================================

  -- Staff can upload expense receipts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff upload expense receipts'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff upload expense receipts"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'expense-receipts'
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can view expense receipts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff view expense receipts'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff view expense receipts"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'expense-receipts'
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can update expense receipts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff update expense receipts'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff update expense receipts"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'expense-receipts'
          AND public.is_staff()
        )
        WITH CHECK (
          bucket_id = 'expense-receipts'
          AND public.is_staff()
        );
    $sql$;
  END IF;

  -- Staff can delete expense receipts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff delete expense receipts'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff delete expense receipts"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'expense-receipts'
          AND public.is_staff()
        );
    $sql$;
  END IF;
END;
$$;

COMMIT;

