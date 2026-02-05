-- Extend discount_campaigns with booking_source and amount_type (fixed/percentage)
-- and update discount functions + bulk import accordingly.

-- 1) Table changes
ALTER TABLE public.discount_campaigns
  ADD COLUMN IF NOT EXISTS booking_source TEXT;

ALTER TABLE public.discount_campaigns
  ADD COLUMN IF NOT EXISTS amount_type TEXT NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'discount_amount_type_check'
      AND conrelid = 'public.discount_campaigns'::regclass
  ) THEN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_amount_type_check
      CHECK (amount_type IN ('fixed', 'percentage'));
  END IF;
END;
$$;

-- 2) Update eligibility function to respect booking_source
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

  -- Applies-to logic (all/new/rebooking)
  IF v_campaign.applies_to = 'all' THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'new' AND NOT COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'rebooking' AND COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  END IF;

  -- Booking source filter (optional)
  IF v_is_eligible
     AND v_campaign.booking_source IS NOT NULL
     AND v_application.booking_source IS DISTINCT FROM v_campaign.booking_source THEN
    v_is_eligible := false;
  END IF;

  -- Only one discount per application
  IF v_is_eligible AND EXISTS (
    SELECT 1 FROM public.application_discounts
    WHERE application_id = p_application_id
  ) THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;

-- 3) Update apply_discount_to_application to support fixed / percentage
CREATE OR REPLACE FUNCTION public.apply_discount_to_application(
  p_application_id UUID,
  p_campaign_id UUID,
  p_applied_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_discount_id UUID;
  v_discount_value NUMERIC;
  v_contract_value NUMERIC;
BEGIN
  IF NOT public.check_discount_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this discount campaign';
  END IF;

  SELECT * INTO v_campaign
  FROM public.discount_campaigns
  WHERE id = p_campaign_id;

  -- Calculate monetary discount value
  IF v_campaign.amount_type = 'percentage' THEN
    -- Use existing helper to get contract total
    BEGIN
      v_contract_value := public.get_contract_value(p_application_id);
    EXCEPTION WHEN OTHERS THEN
      v_contract_value := 0;
    END;

    v_contract_value := COALESCE(v_contract_value, 0);
    v_discount_value := ROUND(v_contract_value * (COALESCE(v_campaign.discount_amount, 0) / 100.0), 2);

    -- Clamp between 0 and contract value
    IF v_discount_value < 0 THEN
      v_discount_value := 0;
    ELSIF v_discount_value > v_contract_value THEN
      v_discount_value := v_contract_value;
    END IF;
  ELSE
    v_discount_value := COALESCE(v_campaign.discount_amount, 0);
    IF v_discount_value < 0 THEN
      v_discount_value := 0;
    END IF;
  END IF;

  INSERT INTO public.application_discounts (
    application_id,
    campaign_id,
    discount_amount,
    applied_by
  ) VALUES (
    p_application_id,
    p_campaign_id,
    v_discount_value,
    p_applied_by
  )
  RETURNING id INTO v_discount_id;

  UPDATE public.student_applications
  SET discount_amount = v_discount_value
  WHERE id = p_application_id;

  UPDATE public.discount_campaigns
  SET current_uses = current_uses + 1
  WHERE id = p_campaign_id;

  RETURN v_discount_id;
END;
$$;

-- 4) Update bulk_import_discount_campaigns to handle amount_type and booking_source
CREATE OR REPLACE FUNCTION public.bulk_import_discount_campaigns(
  p_data JSONB,
  p_imported_by UUID
)
RETURNS TABLE (
  row_number INTEGER,
  status TEXT,
  record_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_applies_to TEXT;
  v_amount_type TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      v_applies_to := LOWER(COALESCE(v_row->>'applies_to', 'all'));
      IF v_applies_to NOT IN ('all', 'new', 'rebooking') THEN
        v_applies_to := 'all';
      END IF;

      v_amount_type := LOWER(COALESCE(v_row->>'amount_type', 'fixed'));
      IF v_amount_type NOT IN ('fixed', 'percentage') THEN
        v_amount_type := 'fixed';
      END IF;

      INSERT INTO public.discount_campaigns (
        name,
        description,
        discount_amount,
        amount_type,
        applies_to,
        start_date,
        end_date,
        is_active,
        max_uses,
        current_uses,
        booking_source,
        created_by
      )
      VALUES (
        v_row->>'name',
        NULLIF(v_row->>'description', ''),
        (v_row->>'discount_amount')::NUMERIC(10,2),
        v_amount_type,
        v_applies_to,
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        NULLIF(v_row->>'max_uses', '')::INTEGER,
        COALESCE((v_row->>'current_uses')::INTEGER, 0),
        NULLIF(v_row->>'booking_source', ''),
        p_imported_by
      )
      RETURNING id INTO v_record_id;

      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;

