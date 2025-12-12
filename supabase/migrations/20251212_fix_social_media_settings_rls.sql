-- Fix RLS policies for social_media_settings to support upsert operations
-- Issue: FOR ALL policy may not work correctly with upsert
-- Solution: Create separate INSERT and UPDATE policies

-- Drop the existing FOR ALL policy
DROP POLICY IF EXISTS "Staff manage social media settings" ON public.social_media_settings;

-- Create separate INSERT policy
CREATE POLICY "Staff insert social media settings"
  ON public.social_media_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

-- Create separate UPDATE policy
CREATE POLICY "Staff update social media settings"
  ON public.social_media_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Grant INSERT and UPDATE permissions to authenticated users
-- RLS will restrict to staff only
GRANT INSERT, UPDATE ON public.social_media_settings TO authenticated;

