-- Update Auto-Allocation Trigger
-- Sets allocation to 'Student' when application is confirmed
-- Now handles both INSERT and UPDATE operations to support bulk imports

CREATE OR REPLACE FUNCTION public.handle_application_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT: If application is created with 'confirmed' status (e.g., bulk imports)
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
    UPDATE public.studios
    SET status = 'occupied',
        allocation = 'Student'  -- Set permanent allocation to Student
    WHERE id = NEW.assigned_studio_id;
  END IF;
  
  -- Handle UPDATE: If application status changed to 'confirmed'
  IF TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
    UPDATE public.studios
    SET status = 'occupied',
        allocation = 'Student'  -- Set permanent allocation to Student
    WHERE id = NEW.assigned_studio_id;
  END IF;

  -- Handle UPDATE: If application status changed from 'confirmed' to something else
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' AND OLD.assigned_studio_id IS NOT NULL THEN
    -- Release the studio back to available and clear allocation
    UPDATE public.studios
    SET status = 'available',
        allocation = NULL  -- Clear allocation when unconfirmed
    WHERE id = OLD.assigned_studio_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to handle both INSERT and UPDATE operations
-- Note: We need separate triggers for INSERT and UPDATE because WHEN clause can't use TG_OP
DROP TRIGGER IF EXISTS application_confirmation_trigger_insert ON public.student_applications;
DROP TRIGGER IF EXISTS application_confirmation_trigger_update ON public.student_applications;

-- Trigger for INSERT operations
CREATE TRIGGER application_confirmation_trigger_insert
AFTER INSERT ON public.student_applications
FOR EACH ROW
WHEN (NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL)
EXECUTE FUNCTION public.handle_application_confirmation();

-- Trigger for UPDATE operations
CREATE TRIGGER application_confirmation_trigger_update
AFTER UPDATE OF status ON public.student_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_application_confirmation();

