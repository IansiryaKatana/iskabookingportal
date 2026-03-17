-- Allow staff to remove/unapply a cashback from an application.
-- This resets student_applications.cashback_amount, deletes the latest
-- application_cashbacks row, and decrements campaign current_uses.

CREATE OR REPLACE FUNCTION public.remove_cashback_from_application(
  p_application_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cashback_record public.application_cashbacks%ROWTYPE;
BEGIN
  -- Find the latest cashback record for this application, if any
  SELECT *
  INTO v_cashback_record
  FROM public.application_cashbacks
  WHERE application_id = p_application_id
  ORDER BY applied_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Nothing to remove
    RETURN;
  END IF;

  -- Delete the cashback record
  DELETE FROM public.application_cashbacks
  WHERE id = v_cashback_record.id;

  -- Reset denormalized cashback_amount on the application
  UPDATE public.student_applications
  SET cashback_amount = 0
  WHERE id = p_application_id;

  -- Decrement campaign usage, but don't go below zero
  UPDATE public.cashback_campaigns
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE id = v_cashback_record.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_cashback_from_application(UUID) TO authenticated;

