-- Allow staff to remove/unapply a discount from an application.
-- This resets student_applications.discount_amount, deletes the latest
-- application_discounts row, and decrements campaign current_uses.

CREATE OR REPLACE FUNCTION public.remove_discount_from_application(
  p_application_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount_record public.application_discounts%ROWTYPE;
BEGIN
  -- Find the latest discount record for this application, if any
  SELECT *
  INTO v_discount_record
  FROM public.application_discounts
  WHERE application_id = p_application_id
  ORDER BY applied_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Nothing to remove
    RETURN;
  END IF;

  -- Delete the discount record
  DELETE FROM public.application_discounts
  WHERE id = v_discount_record.id;

  -- Reset denormalized discount_amount on the application
  UPDATE public.student_applications
  SET discount_amount = 0
  WHERE id = p_application_id;

  -- Decrement campaign usage, but don't go below zero
  UPDATE public.discount_campaigns
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE id = v_discount_record.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_discount_from_application(UUID) TO authenticated;
