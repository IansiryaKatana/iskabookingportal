-- Discount System (mirrors cashback: campaigns, application_discounts, discount_amount)
-- Enables discount campaigns and per-application discounts; get_payment_summary subtracts both cashback and discount.

-- ============================================================================
-- PART 1: DISCOUNT CAMPAIGNS AND APPLICATION DISCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.discount_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  discount_amount NUMERIC(10,2) NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'all',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discount_campaigns_date_check CHECK (start_date <= end_date),
  CONSTRAINT discount_campaigns_applies_to_check CHECK (applies_to IN ('all', 'new', 'rebooking'))
);

CREATE TABLE IF NOT EXISTS public.application_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.discount_campaigns(id) ON DELETE RESTRICT,
  discount_amount NUMERIC(10,2) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id)
);

ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- ============================================================================
-- PART 2: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_discount_campaigns_active ON public.discount_campaigns(is_active, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_discount_campaigns_dates ON public.discount_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_discount_campaigns_academic_year ON public.discount_campaigns(academic_year_id) WHERE academic_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_application_discounts_application ON public.application_discounts(application_id);
CREATE INDEX IF NOT EXISTS idx_application_discounts_campaign ON public.application_discounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_student_applications_discount ON public.student_applications(discount_amount) WHERE discount_amount > 0;

-- ============================================================================
-- PART 3: RLS
-- ============================================================================

ALTER TABLE public.discount_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all discount campaigns" ON public.discount_campaigns;
CREATE POLICY "Staff can view all discount campaigns" ON public.discount_campaigns
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage discount campaigns" ON public.discount_campaigns;
CREATE POLICY "Staff can manage discount campaigns" ON public.discount_campaigns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Students can view active discount campaigns" ON public.discount_campaigns;
CREATE POLICY "Students can view active discount campaigns" ON public.discount_campaigns
  FOR SELECT USING (
    is_active = true
    AND start_date <= CURRENT_DATE
    AND end_date >= CURRENT_DATE
  );

ALTER TABLE public.application_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all application discounts" ON public.application_discounts;
CREATE POLICY "Staff can view all application discounts" ON public.application_discounts
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage application discounts" ON public.application_discounts;
CREATE POLICY "Staff can manage application discounts" ON public.application_discounts
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Students can view their own application discount" ON public.application_discounts;
CREATE POLICY "Students can view their own application discount" ON public.application_discounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = application_discounts.application_id
        AND sa.student_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4: TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS set_timestamp_discount_campaigns ON public.discount_campaigns;
CREATE TRIGGER set_timestamp_discount_campaigns
BEFORE UPDATE ON public.discount_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_application_discounts ON public.application_discounts;
CREATE TRIGGER set_timestamp_application_discounts
BEFORE UPDATE ON public.application_discounts
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 5: FUNCTIONS
-- ============================================================================

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
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.application_discounts
    WHERE application_id = p_application_id
  ) THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;

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
BEGIN
  IF NOT public.check_discount_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this discount campaign';
  END IF;

  SELECT * INTO v_campaign
  FROM public.discount_campaigns
  WHERE id = p_campaign_id;

  INSERT INTO public.application_discounts (
    application_id,
    campaign_id,
    discount_amount,
    applied_by
  ) VALUES (
    p_application_id,
    p_campaign_id,
    v_campaign.discount_amount,
    p_applied_by
  )
  RETURNING id INTO v_discount_id;

  UPDATE public.student_applications
  SET discount_amount = v_campaign.discount_amount
  WHERE id = p_application_id;

  UPDATE public.discount_campaigns
  SET current_uses = current_uses + 1
  WHERE id = p_campaign_id;

  RETURN v_discount_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_application_total_with_discount(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_due NUMERIC;
  v_cashback NUMERIC;
  v_discount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  SELECT COALESCE(cashback_amount, 0), COALESCE(discount_amount, 0)
  INTO v_cashback, v_discount
  FROM public.student_applications
  WHERE id = p_application_id;

  RETURN GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0) - COALESCE(v_discount, 0), 0);
END;
$$;

-- ============================================================================
-- PART 6: UPDATE get_payment_summary TO SUBTRACT DISCOUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_payment_summary(p_application_id UUID)
RETURNS TABLE (
  total_due NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  last_payment_date TIMESTAMPTZ,
  payment_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_total NUMERIC := 0;
  v_deposit_amount NUMERIC := 0;
  v_total_due NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_total_due_after_reductions NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_payment_plan_id UUID;
  v_contract_id UUID;
  v_remaining_balance NUMERIC;
  v_tolerance NUMERIC := 1.00;
  v_schedule_exists BOOLEAN := false;
  v_stripe_paid NUMERIC := 0;
  v_stripe_count INTEGER := 0;
  v_stripe_last TIMESTAMPTZ;
  v_manual_paid NUMERIC := 0;
  v_manual_count INTEGER := 0;
  v_manual_last TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  SELECT sa.contract_id, sa.selected_payment_plan_id
  INTO v_contract_id, v_payment_plan_id
  FROM public.student_applications sa
  WHERE sa.id = p_application_id;

  BEGIN
    SELECT
      COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
      COALESCE(c.weeks, 0)
    INTO v_contract_weekly_price, v_contract_weeks
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.studio_grade_prices sgp
      ON sgp.academic_year_id = c.academic_year_id
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_contract_weekly_price := 0;
    v_contract_weeks := 0;
  END;

  v_contract_total := COALESCE(v_contract_weekly_price, 0) * COALESCE(v_contract_weeks, 0);

  BEGIN
    SELECT COALESCE(c.deposit_override, pp.deposit_amount, sgp.deposit_amount_override, 0)
    INTO v_deposit_amount
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.payment_plans pp ON pp.id = v_payment_plan_id
    LEFT JOIN public.studio_grade_prices sgp
      ON sgp.academic_year_id = c.academic_year_id
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_deposit_amount := 0;
  END;

  v_deposit_amount := COALESCE(v_deposit_amount, 0);
  v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);

  SELECT EXISTS (SELECT 1 FROM public.contract_payment_schedule WHERE contract_id = v_contract_id)
  INTO v_schedule_exists;

  IF v_schedule_exists THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_due
      FROM public.contract_payment_schedule
      WHERE contract_id = v_contract_id
        AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
        AND (sequence > 1 OR amount != v_deposit_amount);

      IF v_total_due IS NULL OR v_total_due = 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
    END;
  END IF;

  IF NOT v_schedule_exists AND v_payment_plan_id IS NOT NULL AND v_remaining_balance > 0 THEN
    BEGIN
      WITH installment_calc AS (
        SELECT
          sequence,
          amount_type,
          amount_value,
          CASE
            WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100)
            WHEN amount_type = 'fixed' THEN amount_value
            ELSE 0
          END AS calculated_amount,
          ROW_NUMBER() OVER (ORDER BY sequence) AS rn,
          COUNT(*) OVER () AS total
        FROM public.payment_plan_installments
        WHERE payment_plan_id = v_payment_plan_id
          AND LOWER(COALESCE(label, '')) NOT LIKE '%deposit%'
      ),
      sum_previous AS (
        SELECT COALESCE(SUM(calculated_amount), 0) AS sum_prev
        FROM installment_calc
        WHERE rn < total
      )
      SELECT COALESCE(sp.sum_prev, 0) + GREATEST(v_remaining_balance - COALESCE(sp.sum_prev, 0), 0)
      INTO v_total_due
      FROM sum_previous sp;

      IF v_total_due IS NULL OR v_total_due <= 0 THEN
        v_total_due := v_remaining_balance;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := v_remaining_balance;
    END;
  END IF;

  v_total_due := COALESCE(v_total_due, 0);

  BEGIN
    SELECT COALESCE(cashback_amount, 0), COALESCE(discount_amount, 0)
    INTO v_cashback, v_discount
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
    v_discount := 0;
  END;

  v_total_due_after_reductions := GREATEST(v_total_due - COALESCE(v_cashback, 0) - COALESCE(v_discount, 0), 0);

  BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(created_at)
    INTO v_stripe_paid, v_stripe_count, v_stripe_last
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id
      AND payment_type = 'instalment'
      AND status IN ('succeeded', 'completed');

    SELECT COALESCE(SUM(amount), 0), COUNT(*), MAX(payment_date::TIMESTAMPTZ)
    INTO v_manual_paid, v_manual_count, v_manual_last
    FROM public.manual_payments
    WHERE application_id = p_application_id
      AND payment_type = 'instalment';
  EXCEPTION WHEN OTHERS THEN
    v_stripe_paid := 0;
    v_stripe_count := 0;
    v_stripe_last := NULL;
    v_manual_paid := 0;
    v_manual_count := 0;
    v_manual_last := NULL;
  END;

  v_total_paid := COALESCE(v_stripe_paid, 0) + COALESCE(v_manual_paid, 0);
  v_payment_count := COALESCE(v_stripe_count, 0) + COALESCE(v_manual_count, 0);
  v_last_payment_date := COALESCE(GREATEST(v_stripe_last, v_manual_last), v_stripe_last, v_manual_last);

  v_remaining_balance := GREATEST(v_total_due_after_reductions - v_total_paid, 0);
  IF ABS(v_total_due_after_reductions - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
    v_remaining_balance := 0;
  END IF;

  RETURN QUERY SELECT
    v_total_due_after_reductions,
    v_total_paid,
    v_remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE
      WHEN v_remaining_balance <= v_tolerance AND v_total_paid > 0 THEN 'fully_paid'
      WHEN v_total_due_after_reductions <= 0.01 THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;

-- ============================================================================
-- PART 7: AUTO-APPLY DISCOUNT ON CONFIRMATION (optional, mirror cashback)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_apply_discount_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_applies_to TEXT;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    IF EXISTS (SELECT 1 FROM public.application_discounts WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    v_applies_to := CASE
      WHEN COALESCE(NEW.is_rebooking, false) THEN 'rebooking'
      ELSE 'new'
    END;

    SELECT * INTO v_campaign
    FROM public.discount_campaigns
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
      AND (applies_to = 'all' OR applies_to = v_applies_to)
      AND (max_uses IS NULL OR current_uses < max_uses)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.apply_discount_to_application(NEW.id, v_campaign.id, NULL);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_apply_discount ON public.student_applications;
CREATE TRIGGER trigger_auto_apply_discount
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION public.auto_apply_discount_on_confirmation();

-- ============================================================================
-- PART 8: GRANTS AND COMMENTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_discounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_discount_eligibility(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_discount_to_application(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_application_total_with_discount(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID) TO authenticated, anon;

COMMENT ON TABLE public.discount_campaigns IS 'Discount campaign definitions (e.g. early-bird discount)';
COMMENT ON TABLE public.application_discounts IS 'Tracks which applications have a discount applied';
COMMENT ON COLUMN public.student_applications.discount_amount IS 'Discount amount applied (denormalized for quick access)';
