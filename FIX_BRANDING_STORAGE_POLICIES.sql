-- ============================================================================
-- FIX BRANDING STORAGE POLICIES
-- ============================================================================
-- Run this SQL directly in Supabase Dashboard > SQL Editor
-- This fixes the RLS policy error when uploading branding assets
-- ============================================================================

BEGIN;

-- Drop existing policies if they exist (to recreate them properly)
DROP POLICY IF EXISTS "Public read branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete branding assets" ON storage.objects;

-- Ensure the branding bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

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

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the policies were created correctly:

-- Check if policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%branding%'
ORDER BY policyname;

-- Check if is_staff() function exists and works
SELECT public.is_staff() as is_staff_result;

-- Check your current role
SELECT 
  id,
  role,
  first_name,
  last_name
FROM public.profiles
WHERE id = auth.uid();

