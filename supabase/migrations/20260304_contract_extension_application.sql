-- Contract extensions: link a new application (extension period) to the original application.
-- Extension = same student, same room; add more weeks and a new payment schedule.
-- Only one level: extension points to original (extension_of_application_id must point to an application that is not itself an extension).

ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS extension_of_application_id uuid REFERENCES public.student_applications (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_applications_extension_of
  ON public.student_applications (extension_of_application_id)
  WHERE extension_of_application_id IS NOT NULL;

-- Prevent extension chains: an extension can only point to an application that is not itself an extension.
-- (CHECK constraints cannot use subqueries in PostgreSQL, so we use a trigger.)
CREATE OR REPLACE FUNCTION public.check_extension_points_to_root()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_extension_of uuid;
BEGIN
  IF NEW.extension_of_application_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.extension_of_application_id INTO v_parent_extension_of
  FROM public.student_applications o
  WHERE o.id = NEW.extension_of_application_id;
  IF v_parent_extension_of IS NOT NULL THEN
    RAISE EXCEPTION 'extension_of_application_id must point to an application that is not itself an extension (no extension chains).'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_extension_points_to_root ON public.student_applications;
CREATE TRIGGER trigger_check_extension_points_to_root
  BEFORE INSERT OR UPDATE OF extension_of_application_id ON public.student_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_extension_points_to_root();

COMMENT ON COLUMN public.student_applications.extension_of_application_id IS
  'When set, this application is a contract extension of that application (same tenancy, additional weeks/installments). Only one level: must point to an application that is not itself an extension.';
