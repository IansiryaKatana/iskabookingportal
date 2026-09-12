-- 12 Sep 2026: remaining SECURITY DEFINER staff/finance RPCs were still
-- executable by anon. Curl could dump students, payments, and occupancy
-- the same way reassign_studio_allocation was called without a session.
--
-- Staff reports and the booking calendar require staff + MFA.
-- Student booking Step 4/5 keeps working for the application's owner.
-- Auto-discount on confirmation still runs from its trigger.

CREATE OR REPLACE FUNCTION public.require_staff_mfa(p_rpc text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF (SELECT auth.uid()) IS NULL
     OR NOT public.is_privileged_portal_user()
     OR NOT public.jwt_is_aal2() THEN
    PERFORM public.raise_security_alert(
      'blocked_privileged_action',
      jsonb_build_object('rpc', p_rpc, 'reason', 'staff_mfa_required')
    );
    RAISE EXCEPTION 'Forbidden: Staff MFA is required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_staff_mfa(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_staff_mfa(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Staff + MFA reports / calendar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_fully_paid_students(
  p_contract_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE(
  application_id uuid,
  student_id uuid,
  first_name text,
  last_name text,
  email text,
  contract_id uuid,
  contract_name text,
  academic_year_id uuid,
  academic_year_name text,
  total_due numeric,
  total_paid numeric,
  remaining_balance numeric,
  payment_status text,
  last_payment_date timestamp with time zone,
  application_status text,
  application_created_at timestamp with time zone,
  studio_number text,
  studio_grade_name text,
  payment_plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
BEGIN
  PERFORM public.require_staff_mfa('get_fully_paid_students');

  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::date END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::date END;

  RETURN QUERY
  SELECT
    fps.application_id,
    fps.student_id,
    fps.first_name,
    fps.last_name,
    COALESCE(u.email, '')::text AS email,
    fps.contract_id,
    fps.contract_name,
    fps.academic_year_id,
    fps.academic_year_name,
    fps.total_due,
    fps.total_paid,
    fps.remaining_balance,
    fps.payment_status,
    fps.last_payment_date,
    fps.application_status::text,
    fps.application_created_at,
    fps.studio_number,
    fps.studio_grade_name,
    fps.payment_plan
  FROM public.fully_paid_students fps
  LEFT JOIN auth.users u ON fps.student_id = u.id
  WHERE (p_contract_id IS NULL OR fps.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR fps.academic_year_id = p_academic_year_id)
    AND (v_start_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) >= v_start_date)
    AND (v_end_date IS NULL OR fps.last_payment_date IS NULL OR date(fps.last_payment_date) <= v_end_date)
  ORDER BY fps.last_payment_date DESC NULLS LAST, fps.application_created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_group_by text DEFAULT 'month'
)
RETURNS TABLE(
  period_label text,
  period_start date,
  period_end date,
  deposit_revenue numeric,
  installment_revenue numeric,
  early_check_in_revenue numeric,
  total_revenue numeric,
  payment_count bigint,
  stripe_revenue numeric,
  manual_revenue numeric,
  total_refunds numeric,
  net_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  PERFORM public.require_staff_mfa('get_revenue_summary');

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

CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_report(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  payment_id uuid,
  payment_source text,
  student_application_id uuid,
  student_id uuid,
  student_name text,
  amount_paid numeric,
  currency text,
  payment_status text,
  payment_date timestamp with time zone,
  stripe_payment_intent_id text,
  payment_method text,
  manual_entry_notes text,
  entered_by_user_id uuid,
  entered_by_name text,
  payment_type text,
  contract_name text,
  studio_grade text,
  invoice_number text,
  invoice_generated_at timestamp with time zone,
  payment_plan text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_staff_mfa('get_bank_reconciliation_report');

  RETURN QUERY
  SELECT
    b.payment_id,
    b.payment_source,
    b.student_application_id,
    b.student_id,
    b.student_name,
    b.amount_paid,
    b.currency,
    b.payment_status,
    b.payment_date,
    b.stripe_payment_intent_id,
    b.payment_method,
    b.manual_entry_notes,
    b.entered_by_user_id,
    b.entered_by_name,
    b.payment_type,
    b.contract_name,
    b.studio_grade,
    b.invoice_number,
    b.invoice_generated_at,
    b.payment_plan
  FROM public.bank_reconciliation_report b
  WHERE (p_start_date IS NULL OR b.payment_date::date >= p_start_date)
    AND (p_end_date IS NULL OR b.payment_date::date <= p_end_date)
  ORDER BY b.payment_date DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_calendar_data(
  p_allocation text DEFAULT NULL,
  p_studio_grade_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE(
  studio_id uuid,
  studio_number text,
  studio_grade_id uuid,
  studio_grade_name text,
  allocation text,
  studio_status text,
  application_id uuid,
  application_status text,
  student_id uuid,
  student_name text,
  student_email text,
  contract_id uuid,
  contract_name text,
  contract_start date,
  contract_end date,
  effective_check_in_date date,
  effective_check_out_date date,
  actual_check_in_date date,
  actual_check_out_date date,
  check_in_notes text,
  check_out_notes text,
  checked_in_by uuid,
  checked_out_by uuid,
  checked_in_at timestamp with time zone,
  checked_out_at timestamp with time zone,
  academic_year_id uuid,
  academic_year_name text,
  application_created_at timestamp with time zone,
  submitted_at timestamp with time zone,
  cancelled_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, auth
AS $$
BEGIN
  PERFORM public.require_staff_mfa('get_booking_calendar_data');

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

-- ---------------------------------------------------------------------------
-- apply_discount: staff MFA from the admin UI; trigger auto-apply still works
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_discount_to_application(
  p_application_id uuid,
  p_campaign_id uuid,
  p_applied_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_campaign RECORD;
  v_discount_id UUID;
  v_discount_value NUMERIC;
  v_contract_value NUMERIC;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    PERFORM public.require_staff_mfa('apply_discount_to_application');
  END IF;

  IF NOT public.check_discount_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this discount campaign';
  END IF;

  SELECT * INTO v_campaign
  FROM public.discount_campaigns
  WHERE id = p_campaign_id;

  IF v_campaign.amount_type = 'percentage' THEN
    BEGIN
      v_contract_value := public.get_contract_value(p_application_id);
    EXCEPTION WHEN OTHERS THEN
      v_contract_value := 0;
    END;

    v_contract_value := COALESCE(v_contract_value, 0);
    v_discount_value := ROUND(v_contract_value * (COALESCE(v_campaign.discount_amount, 0) / 100.0), 2);

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

-- ---------------------------------------------------------------------------
-- Student booking Step 4: owner or staff MFA
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.extend_studio_hold_for_deposit(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_expiry TIMESTAMPTZ := NOW() + INTERVAL '48 hours';
  v_studio_id UUID;
  v_uid uuid := auth.uid();
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Forbidden: Sign in is required'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.student_applications sa
      WHERE sa.id = p_application_id
        AND sa.student_id = v_uid
    ) THEN
      IF NOT (
        public.is_privileged_portal_user()
        AND public.jwt_is_aal2()
      ) THEN
        PERFORM public.raise_security_alert(
          'blocked_privileged_action',
          jsonb_build_object(
            'rpc', 'extend_studio_hold_for_deposit',
            'reason', 'extend_hold_without_owner_or_staff_mfa'
          )
        );
        RAISE EXCEPTION 'Forbidden: Staff MFA is required'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT assigned_studio_id INTO v_studio_id
  FROM public.student_applications
  WHERE id = p_application_id;

  IF v_studio_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No studio assigned');
  END IF;

  UPDATE public.student_applications
  SET
    status = 'awaiting_deposit',
    reserved_studio_expires_at = v_expiry
  WHERE id = p_application_id
    AND status IN ('draft', 'awaiting_deposit');

  UPDATE public.studios
  SET
    status = 'reserved',
    reservation_expires_at = v_expiry,
    allocation = (SELECT student_id::TEXT FROM public.student_applications WHERE id = p_application_id)
  WHERE id = v_studio_id;

  RETURN jsonb_build_object('success', true, 'expiry', v_expiry);
END;
$$;

-- ---------------------------------------------------------------------------
-- Student booking Step 5: logged-in lookup; link only own application or staff
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_payment_by_receipt(p_receipt_number text)
RETURNS TABLE(
  id uuid,
  payment_type text,
  amount numeric,
  payment_method text,
  payment_date date,
  is_linked boolean,
  application_id uuid,
  recorded_by uuid,
  notes text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Sign in is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    mp.payment_type,
    mp.amount,
    mp.payment_method,
    mp.payment_date,
    (mp.application_id IS NOT NULL) AS is_linked,
    mp.application_id,
    mp.recorded_by,
    mp.notes,
    mp.created_at
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
  ORDER BY mp.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_payment_to_application(
  p_receipt_number text,
  p_application_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_type TEXT;
  v_amount NUMERIC;
  v_uid uuid := auth.uid();
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Forbidden: Sign in is required'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.student_applications sa
      WHERE sa.id = p_application_id
        AND sa.student_id = v_uid
    ) THEN
      IF NOT (
        public.is_privileged_portal_user()
        AND public.jwt_is_aal2()
      ) THEN
        PERFORM public.raise_security_alert(
          'blocked_privileged_action',
          jsonb_build_object(
            'rpc', 'link_payment_to_application',
            'reason', 'link_payment_without_owner_or_staff_mfa'
          )
        );
        RAISE EXCEPTION 'Forbidden: Staff MFA is required'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT mp.id, mp.payment_type, mp.amount
  INTO v_payment_id, v_payment_type, v_amount
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
    AND mp.application_id IS NULL
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already linked';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE public.manual_payments
  SET application_id = p_application_id,
      updated_at = NOW()
  WHERE id = v_payment_id;

  RETURN v_payment_id;
END;
$$;

-- CREATE OR REPLACE preserves privileges; re-lock after replace.
REVOKE ALL ON FUNCTION public.get_fully_paid_students(uuid, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fully_paid_students(uuid, uuid, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_revenue_summary(date, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_revenue_summary(date, date, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_bank_reconciliation_report(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_report(date, date)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_booking_calendar_data(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_calendar_data(text, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_discount_to_application(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_discount_to_application(uuid, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.extend_studio_hold_for_deposit(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_studio_hold_for_deposit(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_payment_by_receipt(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_by_receipt(text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.link_payment_to_application(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_payment_to_application(text, uuid)
  TO authenticated, service_role;
