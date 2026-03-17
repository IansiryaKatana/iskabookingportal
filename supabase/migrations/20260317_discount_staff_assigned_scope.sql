-- Add 'staff_assigned' scope for discount campaigns and update eligibility logic

-- 1) Extend applies_to enum constraint to include 'staff_assigned'
ALTER TABLE public.discount_campaigns
DROP CONSTRAINT IF EXISTS discount_campaigns_applies_to_check;

ALTER TABLE public.discount_campaigns
ADD CONSTRAINT discount_campaigns_applies_to_check
CHECK (applies_to IN ('all', 'new', 'rebooking', 'staff_assigned'));

-- 2) Update check_discount_eligibility to treat 'staff_assigned' as manually applied but eligible
CREATE OR REPLACE FUNCTION public.check_discount_eligibility(
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
  FROM public.discount_campaigns
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
    -- Staff-assigned campaigns are valid for any application that otherwise passes basic checks.
    v_is_eligible := true;
  END IF;

  -- Ensure only one discount per application
  IF EXISTS (
    SELECT 1 FROM public.application_discounts
    WHERE application_id = p_application_id
  ) THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;

