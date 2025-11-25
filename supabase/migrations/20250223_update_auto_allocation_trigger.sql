-- Update Auto-Allocation Trigger
-- Sets allocation to 'Student' when application is confirmed

CREATE OR REPLACE FUNCTION public.handle_application_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  -- If application status changed to 'confirmed' and has an assigned studio
  IF NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
    -- Update studio status to 'occupied' and set allocation to 'Student'
    UPDATE public.studios
    SET status = 'occupied',
        allocation = 'Student'  -- Set permanent allocation to Student
    WHERE id = NEW.assigned_studio_id;
  END IF;

  -- If application status changed from 'confirmed' to something else
  IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' AND OLD.assigned_studio_id IS NOT NULL THEN
    -- Release the studio back to available and clear allocation
    UPDATE public.studios
    SET status = 'available',
        allocation = NULL  -- Clear allocation when unconfirmed
    WHERE id = OLD.assigned_studio_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists, no need to recreate
-- The function replacement above will update the existing trigger behavior

