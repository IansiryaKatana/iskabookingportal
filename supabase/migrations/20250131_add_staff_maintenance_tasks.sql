-- Add Staff-Created Maintenance Tasks Support
-- Allows staff to create maintenance tasks for studios or communal areas
-- Tasks start as 'assigned' (bypass triage) and are not visible to students

BEGIN;

-- ============================================================================
-- PART 1: UPDATE maintenance_requests TABLE
-- ============================================================================

-- Make student_id nullable (for staff-created tasks)
ALTER TABLE public.maintenance_requests
  ALTER COLUMN student_id DROP NOT NULL;

-- Add created_by column (tracks which staff member created the task)
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add communal_area_id column (for linking to communal areas)
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS communal_area_id UUID REFERENCES communal_areas(id) ON DELETE SET NULL;

-- Add is_staff_created flag (for filtering and visibility)
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS is_staff_created BOOLEAN DEFAULT false;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_created_by ON public.maintenance_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_communal_area ON public.maintenance_requests(communal_area_id) WHERE communal_area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_staff_created ON public.maintenance_requests(is_staff_created) WHERE is_staff_created = true;

-- Mark all existing requests as student-created
UPDATE public.maintenance_requests
SET is_staff_created = false
WHERE is_staff_created IS NULL;

-- ============================================================================
-- PART 2: UPDATE RLS POLICIES
-- ============================================================================

-- Drop existing student policy
DROP POLICY IF EXISTS "Students manage own requests" ON public.maintenance_requests;

-- Create updated student policy (students can only see their own requests, not staff-created)
CREATE POLICY "Students manage own requests" ON public.maintenance_requests
  FOR ALL USING (
    auth.uid() = student_id 
    AND student_id IS NOT NULL
    AND (is_staff_created = false OR is_staff_created IS NULL)
  );

-- Staff policy remains the same (staff can see all requests)
-- The existing "Staff manage all requests" policy already covers this

-- ============================================================================
-- PART 3: COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.maintenance_requests.created_by IS 'Staff user who created this task (NULL for student-created requests)';
COMMENT ON COLUMN public.maintenance_requests.communal_area_id IS 'Communal area this task is for (NULL if for a studio)';
COMMENT ON COLUMN public.maintenance_requests.is_staff_created IS 'True if created by staff, false if created by student. Used for filtering and visibility.';

COMMIT;

