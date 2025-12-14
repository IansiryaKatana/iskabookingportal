-- Three Modules System: Add New Staff Sub-Roles
-- Phase 3: Add maintenance_officer and housekeeper sub-roles

BEGIN;

-- ============================================================================
-- PART 1: UPDATE staff_subrole COLUMN CONSTRAINT (if exists) OR ADD CHECK
-- ============================================================================

-- First, check if we need to alter the constraint
-- We'll use a function approach to add the new values

DO $$
BEGIN
  -- Check if constraint exists and alter it, or add check constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_staff_subrole_check'
  ) THEN
    -- Drop existing constraint
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_staff_subrole_check;
  END IF;
  
  -- Add new constraint with all sub-roles
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_staff_subrole_check
    CHECK (
      staff_subrole IS NULL OR
      staff_subrole IN (
        'operations_manager',
        'reservationist',
        'accountant',
        'front_desk',
        'maintenance_officer',  -- NEW
        'housekeeper'            -- NEW
      )
    );
END $$;

-- ============================================================================
-- PART 2: UPDATE COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.profiles.staff_subrole IS 
  'Staff sub-role for UI organization (operations_manager, reservationist, accountant, front_desk, maintenance_officer, housekeeper). 
   Only used for display/filtering. Backend permissions still use role = ''staff''.';

COMMIT;

