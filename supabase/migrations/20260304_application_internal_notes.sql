-- Application-level internal notes for staff.
-- Adds a nullable TEXT column on student_applications so staff can record
-- application-specific notes (visible only in admin UI).

ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN public.student_applications.internal_notes IS
  'Staff-only internal notes for this student application.';

