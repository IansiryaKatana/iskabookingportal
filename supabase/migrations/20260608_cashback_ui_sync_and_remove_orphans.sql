-- Align cashback remove/eligibility with denormalized student_applications.cashback_amount.
-- Some historical imports set cashback_amount without an application_cashbacks row,
-- which caused payment totals to reflect cashback while the admin UI showed "Apply".

CREATE OR REPLACE FUNCTION public.check_cashback_eligibility(
  p_application_id UUID,
  p_campaign_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_application RECORD;
  v_is_eligible BOOLEAN := false;
BEGIN
  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND OR NOT v_campaign.is_active THEN
    RETURN false;
  END IF;

  IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
    RETURN false;
  END IF;

  IF v_campaign.max_uses IS NOT NULL AND v_campaign.current_uses >= v_campaign.max_uses THEN
    RETURN false;
  END IF;

  SELECT * INTO v_application
  FROM public.student_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_campaign.applies_to = 'all' THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'new' AND NOT COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'rebooking' AND COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'staff_assigned' THEN
    v_is_eligible := true;
  END IF;

  -- Ensure only one cashback per application (junction row or denormalized amount)
  IF EXISTS (
    SELECT 1 FROM public.application_cashbacks
    WHERE application_id = p_application_id
  ) OR COALESCE(v_application.cashback_amount, 0) > 0 THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;

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
  v_denormalized_amount NUMERIC;
BEGIN
  SELECT *
  INTO v_cashback_record
  FROM public.application_cashbacks
  WHERE application_id = p_application_id
  ORDER BY applied_at DESC
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM public.application_cashbacks
    WHERE id = v_cashback_record.id;

    UPDATE public.cashback_campaigns
    SET current_uses = GREATEST(current_uses - 1, 0)
    WHERE id = v_cashback_record.campaign_id;
  END IF;

  SELECT COALESCE(cashback_amount, 0)
  INTO v_denormalized_amount
  FROM public.student_applications
  WHERE id = p_application_id;

  IF FOUND AND COALESCE(v_denormalized_amount, 0) > 0 THEN
    UPDATE public.student_applications
    SET cashback_amount = 0
    WHERE id = p_application_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_cashback_from_application(UUID) TO authenticated;
