-- Early check-in (ECI): ancillary pre-contract stay linked to a student application.
-- Revenue is tracked separately from deposit/instalments. One ECI per application.
-- Nightly rate = assigned studio grade weekly_price / 7.
-- ECI end date must equal contract_start. Cancel app auto-cancels ECI; payments kept.

BEGIN;

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.early_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE RESTRICT,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE RESTRICT,
  early_check_in_date DATE NOT NULL,
  early_check_out_date DATE NOT NULL,
  nights INTEGER NOT NULL CHECK (nights > 0),
  nightly_rate NUMERIC(12, 4) NOT NULL CHECK (nightly_rate >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT early_check_ins_dates_check CHECK (early_check_in_date < early_check_out_date),
  CONSTRAINT early_check_ins_one_per_application UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS idx_early_check_ins_studio_dates
  ON public.early_check_ins (studio_id, early_check_in_date, early_check_out_date)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_early_check_ins_status
  ON public.early_check_ins (status);

CREATE TABLE IF NOT EXISTS public.early_check_in_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  early_check_in_id UUID NOT NULL REFERENCES public.early_check_ins(id) ON DELETE RESTRICT,
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL DEFAULT 'payment'
    CHECK (payment_type IN ('payment', 'refund', 'adjustment')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN (
      'bank_transfer', 'cash', 'card', 'stripe', 'other'
    )),
  reference_number TEXT NOT NULL,
  payment_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invoice_number TEXT,
  invoice_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_early_check_in_payments_eci
  ON public.early_check_in_payments (early_check_in_id);

CREATE INDEX IF NOT EXISTS idx_early_check_in_payments_application
  ON public.early_check_in_payments (application_id);

CREATE INDEX IF NOT EXISTS idx_early_check_in_payments_date
  ON public.early_check_in_payments (payment_date DESC);

CREATE OR REPLACE FUNCTION public.set_early_check_in_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS early_check_ins_updated_at ON public.early_check_ins;
CREATE TRIGGER early_check_ins_updated_at
  BEFORE UPDATE ON public.early_check_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.set_early_check_in_updated_at();

DROP TRIGGER IF EXISTS early_check_in_payments_updated_at ON public.early_check_in_payments;
CREATE TRIGGER early_check_in_payments_updated_at
  BEFORE UPDATE ON public.early_check_in_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_early_check_in_updated_at();

COMMENT ON TABLE public.early_check_ins IS
  'Pre-contract early arrival stay linked to a student application. Separate from academic-year contract revenue.';
COMMENT ON TABLE public.early_check_in_payments IS
  'Cash received for early check-in charges. Not counted toward contract deposit/instalment balances.';

-- ============================================================================
-- 2. RATE HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_early_check_in_nightly_rate(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly NUMERIC := 0;
BEGIN
  SELECT COALESCE(c.weekly_price_override, sgp.weekly_price, 0)
  INTO v_weekly
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  INNER JOIN public.studios s ON s.id = sa.assigned_studio_id
  LEFT JOIN public.studio_grade_prices sgp
    ON sgp.academic_year_id = c.academic_year_id
   AND sgp.studio_grade_id = s.studio_grade_id
   AND sgp.is_active = true
  WHERE sa.id = p_application_id;

  IF NOT FOUND OR v_weekly IS NULL THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_weekly / 7.0, 4);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_early_check_in_nightly_rate(UUID) TO authenticated;

-- ============================================================================
-- 3. PAYMENT SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_early_check_in_payment_summary(p_application_id UUID)
RETURNS TABLE (
  early_check_in_id UUID,
  status TEXT,
  early_check_in_date DATE,
  early_check_out_date DATE,
  nights INTEGER,
  nightly_rate NUMERIC,
  amount_due NUMERIC,
  total_received NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  last_payment_date DATE,
  payment_status TEXT,
  currency TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eci public.early_check_ins%ROWTYPE;
  v_received NUMERIC := 0;
  v_count INTEGER := 0;
  v_last DATE;
  v_remaining NUMERIC := 0;
  v_status TEXT := 'unpaid';
  v_tolerance NUMERIC := 0.01;
BEGIN
  SELECT * INTO v_eci
  FROM public.early_check_ins
  WHERE application_id = p_application_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN p.payment_type = 'refund' THEN -p.amount
        ELSE p.amount
      END
    ), 0),
    COUNT(*)::INTEGER,
    MAX(p.payment_date)
  INTO v_received, v_count, v_last
  FROM public.early_check_in_payments p
  WHERE p.early_check_in_id = v_eci.id;

  v_remaining := GREATEST(0, v_eci.total_amount - v_received);

  IF v_eci.status = 'cancelled' THEN
    v_status := 'void';
  ELSIF v_eci.total_amount <= v_tolerance THEN
    v_status := 'no_amount_due';
  ELSIF v_received <= v_tolerance THEN
    v_status := 'unpaid';
  ELSIF v_received + v_tolerance < v_eci.total_amount THEN
    v_status := 'partially_paid';
  ELSIF v_received <= v_eci.total_amount + v_tolerance THEN
    v_status := 'fully_paid';
  ELSE
    v_status := 'overpaid';
  END IF;

  RETURN QUERY SELECT
    v_eci.id,
    v_eci.status,
    v_eci.early_check_in_date,
    v_eci.early_check_out_date,
    v_eci.nights,
    v_eci.nightly_rate,
    v_eci.total_amount,
    v_received,
    v_remaining,
    v_count,
    v_last,
    v_status,
    v_eci.currency;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_early_check_in_payment_summary(UUID) TO authenticated;

-- ============================================================================
-- 4. CREATE / CANCEL / RECORD PAYMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_early_check_in(
  p_application_id UUID,
  p_early_check_in_date DATE,
  p_notes TEXT DEFAULT NULL,
  p_nightly_rate_override NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.student_applications%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_studio_id UUID;
  v_rate NUMERIC;
  v_nights INTEGER;
  v_total NUMERIC;
  v_existing public.early_check_ins%ROWTYPE;
  v_has_existing BOOLEAN := false;
  v_eci_id UUID;
  v_conflict_ota TEXT;
  v_conflict_app TEXT;
  v_conflict_eci TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can create early check-in';
  END IF;

  IF p_application_id IS NULL OR p_early_check_in_date IS NULL THEN
    RAISE EXCEPTION 'Application id and early check-in date are required';
  END IF;

  SELECT * INTO v_app
  FROM public.student_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Early check-in is only allowed for confirmed applications (current status: %)', v_app.status;
  END IF;

  IF v_app.assigned_studio_id IS NULL THEN
    RAISE EXCEPTION 'Application has no assigned studio';
  END IF;

  v_studio_id := v_app.assigned_studio_id;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = v_app.contract_id;

  IF NOT FOUND OR v_contract.contract_start IS NULL THEN
    RAISE EXCEPTION 'Contract start date is required for early check-in';
  END IF;

  IF p_early_check_in_date >= v_contract.contract_start::DATE THEN
    RAISE EXCEPTION 'Early check-in date must be before contract start (%)', v_contract.contract_start::DATE;
  END IF;

  SELECT * INTO v_existing
  FROM public.early_check_ins
  WHERE application_id = p_application_id;

  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.status = 'confirmed' THEN
    RAISE EXCEPTION 'This application already has an early check-in';
  END IF;

  v_nights := (v_contract.contract_start::DATE - p_early_check_in_date);
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'Early check-in must include at least one night';
  END IF;

  IF p_nightly_rate_override IS NOT NULL THEN
    IF p_nightly_rate_override < 0 THEN
      RAISE EXCEPTION 'Nightly rate cannot be negative';
    END IF;
    v_rate := ROUND(p_nightly_rate_override, 4);
  ELSE
    v_rate := public.get_early_check_in_nightly_rate(p_application_id);
  END IF;

  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'Could not resolve nightly rate from studio grade weekly price. Set a weekly price or provide an override.';
  END IF;

  v_total := ROUND(v_rate * v_nights, 2);

  -- Conflict: OTA bookings
  SELECT ob.external_ref INTO v_conflict_ota
  FROM public.ota_bookings ob
  WHERE ob.studio_id = v_studio_id
    AND ob.status NOT IN ('cancelled', 'no_show')
    AND ob.check_in < v_contract.contract_start::DATE
    AND ob.check_out > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_ota IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping OTA booking (ref: %)', v_conflict_ota;
  END IF;

  -- Conflict: other student applications (including their ECI window)
  SELECT sa.id::TEXT INTO v_conflict_app
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.early_check_ins eci
    ON eci.application_id = sa.id AND eci.status = 'confirmed'
  WHERE sa.assigned_studio_id = v_studio_id
    AND sa.id <> p_application_id
    AND sa.status = 'confirmed'
    AND COALESCE(sa.actual_check_in_date, eci.early_check_in_date, c.contract_start::DATE)
        < v_contract.contract_start::DATE
    AND COALESCE(sa.actual_check_out_date, c.contract_end::DATE)
        > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_app IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping student booking (application %)', v_conflict_app;
  END IF;

  -- Conflict: other early check-ins
  SELECT eci.application_id::TEXT INTO v_conflict_eci
  FROM public.early_check_ins eci
  WHERE eci.studio_id = v_studio_id
    AND eci.status = 'confirmed'
    AND eci.application_id <> p_application_id
    AND eci.early_check_in_date < v_contract.contract_start::DATE
    AND eci.early_check_out_date > p_early_check_in_date
  LIMIT 1;

  IF v_conflict_eci IS NOT NULL THEN
    RAISE EXCEPTION 'Studio has an overlapping early check-in (application %)', v_conflict_eci;
  END IF;

  IF v_has_existing AND v_existing.status = 'cancelled' THEN
    UPDATE public.early_check_ins
    SET
      studio_id = v_studio_id,
      early_check_in_date = p_early_check_in_date,
      early_check_out_date = v_contract.contract_start::DATE,
      nights = v_nights,
      nightly_rate = v_rate,
      total_amount = v_total,
      status = 'confirmed',
      notes = NULLIF(TRIM(p_notes), ''),
      created_by = v_user_id,
      cancelled_at = NULL,
      cancelled_by = NULL,
      cancel_reason = NULL,
      updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING id INTO v_eci_id;
  ELSE
    INSERT INTO public.early_check_ins (
      application_id,
      studio_id,
      early_check_in_date,
      early_check_out_date,
      nights,
      nightly_rate,
      total_amount,
      notes,
      created_by,
      status
    ) VALUES (
      p_application_id,
      v_studio_id,
      p_early_check_in_date,
      v_contract.contract_start::DATE,
      v_nights,
      v_rate,
      v_total,
      NULLIF(TRIM(p_notes), ''),
      v_user_id,
      'confirmed'
    )
    RETURNING id INTO v_eci_id;
  END IF;

  -- Align planned actual check-in if not already set earlier
  UPDATE public.student_applications
  SET
    actual_check_in_date = CASE
      WHEN actual_check_in_date IS NULL OR actual_check_in_date > p_early_check_in_date
        THEN p_early_check_in_date
      ELSE actual_check_in_date
    END,
    updated_at = NOW()
  WHERE id = p_application_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
  VALUES (
    'student_application',
    p_application_id,
    'early_check_in_created',
    'Early check-in from ' || p_early_check_in_date::TEXT
      || ' to ' || v_contract.contract_start::DATE::TEXT
      || ' (' || v_nights::TEXT || ' nights @ ' || v_rate::TEXT || '). Total '
      || v_total::TEXT,
    v_user_id
  );

  RETURN jsonb_build_object(
    'early_check_in_id', v_eci_id,
    'application_id', p_application_id,
    'studio_id', v_studio_id,
    'early_check_in_date', p_early_check_in_date,
    'early_check_out_date', v_contract.contract_start::DATE,
    'nights', v_nights,
    'nightly_rate', v_rate,
    'total_amount', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_early_check_in(
  p_application_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_eci public.early_check_ins%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can cancel early check-in';
  END IF;

  SELECT * INTO v_eci
  FROM public.early_check_ins
  WHERE application_id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No early check-in found for this application';
  END IF;

  IF v_eci.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'early_check_in_id', v_eci.id,
      'already_cancelled', true
    );
  END IF;

  UPDATE public.early_check_ins
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_by = v_user_id,
    cancel_reason = NULLIF(TRIM(p_reason), ''),
    updated_at = NOW()
  WHERE id = v_eci.id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, from_status, to_status, message, created_by)
  VALUES (
    'student_application',
    p_application_id,
    'early_check_in_cancelled',
    'confirmed',
    'cancelled',
    'Early check-in cancelled'
      || COALESCE(' — ' || NULLIF(TRIM(p_reason), ''), '')
      || '. Payment history retained.',
    v_user_id
  );

  RETURN jsonb_build_object(
    'early_check_in_id', v_eci.id,
    'application_id', p_application_id,
    'cancelled', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_early_check_in_payment(
  p_application_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_reference_number TEXT,
  p_payment_method TEXT DEFAULT 'bank_transfer',
  p_payment_type TEXT DEFAULT 'payment',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_eci public.early_check_ins%ROWTYPE;
  v_payment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can record early check-in payments';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Payment date is required';
  END IF;

  IF NULLIF(TRIM(p_reference_number), '') IS NULL THEN
    RAISE EXCEPTION 'Reference number is required';
  END IF;

  IF p_payment_method NOT IN ('bank_transfer', 'cash', 'card', 'stripe', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_payment_type NOT IN ('payment', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid payment type';
  END IF;

  SELECT * INTO v_eci
  FROM public.early_check_ins
  WHERE application_id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No early check-in found for this application';
  END IF;

  IF v_eci.status = 'cancelled' AND p_payment_type = 'payment' THEN
    RAISE EXCEPTION 'Cannot record payments on a cancelled early check-in (refunds/adjustments allowed)';
  END IF;

  INSERT INTO public.early_check_in_payments (
    early_check_in_id,
    application_id,
    amount,
    payment_type,
    payment_method,
    reference_number,
    payment_date,
    currency,
    notes,
    recorded_by
  ) VALUES (
    v_eci.id,
    p_application_id,
    ROUND(p_amount, 2),
    p_payment_type,
    p_payment_method,
    TRIM(p_reference_number),
    p_payment_date,
    v_eci.currency,
    NULLIF(TRIM(p_notes), ''),
    v_user_id
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
  VALUES (
    'student_application',
    p_application_id,
    'early_check_in_payment',
    'Early check-in ' || p_payment_type || ' of ' || ROUND(p_amount, 2)::TEXT
      || ' (' || p_payment_method || ', ref ' || TRIM(p_reference_number) || ')',
    v_user_id
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'early_check_in_id', v_eci.id,
    'application_id', p_application_id,
    'amount', ROUND(p_amount, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_early_check_in(UUID, DATE, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_early_check_in(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_early_check_in_payment(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_create_early_check_in(UUID, DATE, TEXT, NUMERIC) IS
  'Staff-only: create or reactivate early check-in ending on contract_start. Rate defaults to grade weekly/7. Does not alter contract payment plans.';
COMMENT ON FUNCTION public.admin_cancel_early_check_in(UUID, TEXT) IS
  'Staff-only: cancel early check-in; retains payment history.';
COMMENT ON FUNCTION public.admin_record_early_check_in_payment(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) IS
  'Staff-only: record ECI payment/refund/adjustment. Separate from contract instalments.';

-- ============================================================================
-- 5. AUTO-CANCEL ON APPLICATION CANCEL / EXPIRE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_cancel_early_check_in_on_application_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'expired')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.early_check_ins
    SET
      status = 'cancelled',
      cancelled_at = COALESCE(cancelled_at, NOW()),
      cancel_reason = COALESCE(
        cancel_reason,
        'Auto-cancelled because application status changed to ' || NEW.status::TEXT
      ),
      updated_at = NOW()
    WHERE application_id = NEW.id
      AND status = 'confirmed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_applications_cancel_early_check_in ON public.student_applications;
CREATE TRIGGER student_applications_cancel_early_check_in
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cancel_early_check_in_on_application_status();

-- ============================================================================
-- 6. BOOKING CALENDAR: include ECI in effective check-in
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_booking_calendar_data(
  p_allocation TEXT DEFAULT NULL,
  p_studio_grade_id UUID DEFAULT NULL,
  p_academic_year_id UUID DEFAULT NULL
)
RETURNS TABLE (
  studio_id UUID,
  studio_number TEXT,
  studio_grade_id UUID,
  studio_grade_name TEXT,
  allocation TEXT,
  studio_status TEXT,
  application_id UUID,
  application_status TEXT,
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  contract_id UUID,
  contract_name TEXT,
  contract_start DATE,
  contract_end DATE,
  effective_check_in_date DATE,
  effective_check_out_date DATE,
  actual_check_in_date DATE,
  actual_check_out_date DATE,
  check_in_notes TEXT,
  check_out_notes TEXT,
  checked_in_by UUID,
  checked_out_by UUID,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  academic_year_id UUID,
  academic_year_name TEXT,
  application_created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS studio_id,
    s.studio_number,
    s.studio_grade_id,
    sg.name AS studio_grade_name,
    s.allocation,
    s.status::TEXT AS studio_status,
    sa.id AS application_id,
    sa.status::TEXT AS application_status,
    sa.student_id,
    COALESCE(
      pr.first_name || ' ' || pr.last_name,
      (
        SELECT TRIM(
          COALESCE(step1.payload->>'first_name', '') || ' ' ||
          COALESCE(step1.payload->>'last_name', '')
        )
        FROM public.student_application_steps step1
        WHERE step1.application_id = sa.id AND step1.step_number = 1
        LIMIT 1
      ),
      'Unknown'
    ) AS student_name,
    COALESCE(u.email, '')::TEXT AS student_email,
    c.id AS contract_id,
    c.name AS contract_name,
    c.contract_start,
    c.contract_end,
    COALESCE(
      sa.actual_check_in_date,
      eci.early_check_in_date,
      c.contract_start
    ) AS effective_check_in_date,
    COALESCE(sa.actual_check_out_date, c.contract_end) AS effective_check_out_date,
    sa.actual_check_in_date,
    sa.actual_check_out_date,
    sa.check_in_notes,
    sa.check_out_notes,
    sa.checked_in_by,
    sa.checked_out_by,
    sa.checked_in_at,
    sa.checked_out_at,
    c.academic_year_id,
    ay.name AS academic_year_name,
    sa.created_at AS application_created_at,
    sa.submitted_at,
    sa.cancelled_at
  FROM public.studios s
  INNER JOIN public.studio_grades sg ON sg.id = s.studio_grade_id
  LEFT JOIN public.student_applications sa ON sa.assigned_studio_id = s.id
    AND (
      p_academic_year_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contracts c_filter
        WHERE c_filter.id = sa.contract_id
          AND c_filter.academic_year_id = p_academic_year_id
      )
    )
  LEFT JOIN public.early_check_ins eci
    ON eci.application_id = sa.id AND eci.status = 'confirmed'
  LEFT JOIN public.profiles pr ON pr.id = sa.student_id
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN auth.users u ON u.id = sa.student_id
  WHERE s.is_active = true
    AND (p_allocation IS NULL OR p_allocation = '' OR s.allocation = p_allocation)
    AND (p_studio_grade_id IS NULL OR s.studio_grade_id = p_studio_grade_id)
  ORDER BY sg.name, s.studio_number, sa.created_at NULLS FIRST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_calendar_data(TEXT, UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. REVENUE SUMMARY: separate early_check_in_revenue bucket
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_revenue_summary(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_revenue_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_group_by TEXT DEFAULT 'month'
)
RETURNS TABLE (
  period_label TEXT,
  period_start DATE,
  period_end DATE,
  deposit_revenue NUMERIC,
  installment_revenue NUMERIC,
  early_check_in_revenue NUMERIC,
  total_revenue NUMERIC,
  payment_count BIGINT,
  stripe_revenue NUMERIC,
  manual_revenue NUMERIC,
  total_refunds NUMERIC,
  net_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  v_start := COALESCE(p_start_date, DATE_TRUNC('year', CURRENT_DATE)::DATE);
  v_end := COALESCE(p_end_date, CURRENT_DATE);

  RETURN QUERY
  WITH payment_data AS (
    SELECT
      uph.payment_date::DATE AS payment_date,
      uph.amount_paid,
      uph.payment_source,
      CASE
        WHEN COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit' THEN 'deposit'
        ELSE 'installment'
      END AS payment_type
    FROM public.unified_payment_history uph
    WHERE uph.payment_status IN ('succeeded', 'completed')
      AND uph.payment_date::DATE BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      ecp.payment_date,
      CASE
        WHEN ecp.payment_type = 'refund' THEN -ecp.amount
        ELSE ecp.amount
      END AS amount_paid,
      'manual'::TEXT AS payment_source,
      'early_check_in'::TEXT AS payment_type
    FROM public.early_check_in_payments ecp
    WHERE ecp.payment_date BETWEEN v_start AND v_end
  ),
  refund_data AS (
    SELECT
      CASE
        WHEN p_group_by = 'quarter' THEN DATE_TRUNC('quarter', processed_at)::DATE
        ELSE DATE_TRUNC('month', processed_at)::DATE
      END AS refund_period,
      SUM(amount_gbp) AS total_refunds
    FROM public.refunds
    WHERE status = 'succeeded'
      AND processed_at::DATE BETWEEN v_start AND v_end
    GROUP BY refund_period
  ),
  period_data AS (
    SELECT
      CASE
        WHEN p_group_by = 'quarter' THEN DATE_TRUNC('quarter', payment_data.payment_date)::DATE
        ELSE DATE_TRUNC('month', payment_data.payment_date)::DATE
      END AS period_start,
      SUM(CASE WHEN payment_data.payment_type = 'deposit' THEN payment_data.amount_paid ELSE 0 END) AS deposit_revenue,
      SUM(CASE WHEN payment_data.payment_type = 'installment' THEN payment_data.amount_paid ELSE 0 END) AS installment_revenue,
      SUM(CASE WHEN payment_data.payment_type = 'early_check_in' THEN payment_data.amount_paid ELSE 0 END) AS early_check_in_revenue,
      SUM(payment_data.amount_paid) AS total_revenue,
      COUNT(*) AS payment_count,
      SUM(CASE WHEN payment_data.payment_source = 'stripe' THEN payment_data.amount_paid ELSE 0 END) AS stripe_revenue,
      SUM(CASE WHEN payment_data.payment_source = 'manual' THEN payment_data.amount_paid ELSE 0 END) AS manual_revenue
    FROM payment_data
    GROUP BY 1
  )
  SELECT
    CASE
      WHEN p_group_by = 'quarter' THEN
        'Q' || TO_CHAR(period_data.period_start, 'Q') || ' ' || TO_CHAR(period_data.period_start, 'YYYY')
      ELSE
        TO_CHAR(period_data.period_start, 'Month YYYY')
    END AS period_label,
    period_data.period_start,
    CASE
      WHEN p_group_by = 'quarter' THEN (period_data.period_start + INTERVAL '3 months - 1 day')::DATE
      ELSE (period_data.period_start + INTERVAL '1 month - 1 day')::DATE
    END AS period_end,
    period_data.deposit_revenue,
    period_data.installment_revenue,
    period_data.early_check_in_revenue,
    period_data.total_revenue,
    period_data.payment_count,
    period_data.stripe_revenue,
    period_data.manual_revenue,
    COALESCE(rd.total_refunds, 0) AS total_refunds,
    period_data.total_revenue - COALESCE(rd.total_refunds, 0) AS net_revenue
  FROM period_data
  LEFT JOIN refund_data rd ON rd.refund_period = period_data.period_start
  ORDER BY period_data.period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_summary(DATE, DATE, TEXT) TO authenticated;

-- ============================================================================
-- 8. RLS + GRANTS
-- ============================================================================

ALTER TABLE public.early_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.early_check_in_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage early check-ins" ON public.early_check_ins;
CREATE POLICY "Staff manage early check-ins" ON public.early_check_ins
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Students read own early check-ins" ON public.early_check_ins;
CREATE POLICY "Students read own early check-ins" ON public.early_check_ins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = early_check_ins.application_id
        AND sa.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff manage early check-in payments" ON public.early_check_in_payments;
CREATE POLICY "Staff manage early check-in payments" ON public.early_check_in_payments
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Students read own early check-in payments" ON public.early_check_in_payments;
CREATE POLICY "Students read own early check-in payments" ON public.early_check_in_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = early_check_in_payments.application_id
        AND sa.student_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.early_check_ins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.early_check_in_payments TO authenticated;

COMMIT;
