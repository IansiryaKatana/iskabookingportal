-- Clear the 30-minute studio reservation timer once an application moves
-- into the committed post-deposit pipeline. The view no longer uses this
-- field for post-deposit statuses, but keeping it NULL avoids stale data.

CREATE OR REPLACE FUNCTION public.clear_reservation_timer_on_commit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('awaiting_signature', 'awaiting_verification', 'confirmed')
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR NEW.reserved_studio_expires_at IS NOT NULL
     )
  THEN
    NEW.reserved_studio_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_application_clear_reservation_timer ON public.student_applications;

CREATE TRIGGER student_application_clear_reservation_timer
BEFORE UPDATE OF status, reserved_studio_expires_at ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION public.clear_reservation_timer_on_commit();

COMMENT ON FUNCTION public.clear_reservation_timer_on_commit() IS
'Clears reserved_studio_expires_at when application enters post-deposit statuses (awaiting_signature, awaiting_verification, confirmed).';
