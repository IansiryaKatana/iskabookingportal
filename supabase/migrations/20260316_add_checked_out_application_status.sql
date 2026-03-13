-- Add a dedicated 'checked_out' state for student applications so that
-- ended stays can be marked explicitly while keeping history and
-- allowing studios to become available again.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'application_status'
      AND e.enumlabel = 'checked_out'
  ) THEN
    ALTER TYPE public.application_status ADD VALUE 'checked_out';
  END IF;
END;
$$;

COMMENT ON TYPE public.application_status IS
'Application lifecycle: draft, awaiting_*, confirmed, cancelled, expired, checked_out (ended stay but kept for history).';

