-- Verification Script for Communal Areas Setup
-- Run this to check if tables exist and are properly configured

DO $$
BEGIN
  -- Check if communal_areas table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'communal_areas'
  ) THEN
    RAISE NOTICE '✓ communal_areas table exists';
  ELSE
    RAISE WARNING '✗ communal_areas table does NOT exist - run migration 20250131_add_communal_areas.sql';
  END IF;

  -- Check if communal_area_housekeeping table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'communal_area_housekeeping'
  ) THEN
    RAISE NOTICE '✓ communal_area_housekeeping table exists';
  ELSE
    RAISE WARNING '✗ communal_area_housekeeping table does NOT exist - run migration 20250131_add_communal_areas.sql';
  END IF;

  -- Check foreign key constraints
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND constraint_name = 'communal_areas_created_by_fkey'
  ) THEN
    RAISE NOTICE '✓ communal_areas.created_by foreign key exists';
  ELSE
    RAISE WARNING '✗ communal_areas.created_by foreign key missing - run migration 20250131_fix_communal_areas_foreign_keys.sql';
  END IF;

  -- Check RLS policies
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'communal_areas'
    AND policyname = 'Staff manage communal areas'
  ) THEN
    RAISE NOTICE '✓ RLS policy for communal_areas exists';
  ELSE
    RAISE WARNING '✗ RLS policy for communal_areas missing';
  END IF;

END $$;

