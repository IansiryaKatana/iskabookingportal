-- Fix Foreign Key References for Communal Areas
-- Changes foreign keys from auth.users to profiles to enable PostgREST joins
-- Run this if the communal areas tables were already created

BEGIN;

-- ============================================================================
-- PART 1: FIX COMMUNAL_AREAS TABLE
-- ============================================================================

-- Drop existing foreign key constraint if it exists
ALTER TABLE public.communal_areas
  DROP CONSTRAINT IF EXISTS communal_areas_created_by_fkey;

-- Recreate with reference to profiles instead of auth.users
ALTER TABLE public.communal_areas
  ADD CONSTRAINT communal_areas_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 2: FIX COMMUNAL_AREA_HOUSEKEEPING TABLE
-- ============================================================================

-- Drop existing foreign key constraints if they exist
ALTER TABLE public.communal_area_housekeeping
  DROP CONSTRAINT IF EXISTS communal_area_housekeeping_assigned_cleaner_id_fkey;

ALTER TABLE public.communal_area_housekeeping
  DROP CONSTRAINT IF EXISTS communal_area_housekeeping_approved_by_fkey;

-- Recreate with references to profiles instead of auth.users
ALTER TABLE public.communal_area_housekeeping
  ADD CONSTRAINT communal_area_housekeeping_assigned_cleaner_id_fkey
  FOREIGN KEY (assigned_cleaner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.communal_area_housekeeping
  ADD CONSTRAINT communal_area_housekeeping_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 3: FIX MAINTENANCE_REQUESTS TABLE (if created_by column exists)
-- ============================================================================

-- Drop existing foreign key constraint if it exists
ALTER TABLE public.maintenance_requests
  DROP CONSTRAINT IF EXISTS maintenance_requests_created_by_fkey;

-- Recreate with reference to profiles instead of auth.users
-- Only if the column exists (it might not if migration hasn't run yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'maintenance_requests' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.maintenance_requests
      ADD CONSTRAINT maintenance_requests_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

