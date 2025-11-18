-- Trigger to auto-allocate studio when application is confirmed
CREATE OR REPLACE FUNCTION public.handle_application_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  -- If application status changed to 'confirmed' and has an assigned studio
  IF NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
    -- Update studio status to 'occupied'
    UPDATE public.studios
    SET status = 'occupied'
    WHERE id = NEW.assigned_studio_id;
  END IF;

  -- If application status changed from 'confirmed' to something else
  IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' AND OLD.assigned_studio_id IS NOT NULL THEN
    -- Release the studio back to available
    UPDATE public.studios
    SET status = 'available'
    WHERE id = OLD.assigned_studio_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS application_confirmation_trigger ON public.student_applications;
CREATE TRIGGER application_confirmation_trigger
AFTER UPDATE OF status ON public.student_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_application_confirmation();


