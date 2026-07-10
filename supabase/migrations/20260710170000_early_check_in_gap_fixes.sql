-- Early check-in gap fixes: cancel date reset, amend sync, unified history,
-- ledger view, AR ECI columns, fully-paid exclusion, route permissions.

BEGIN;

-- ============================================================================
-- 1. CANCEL ECI: clear planned actual_check_in_date when it was the ECI date
-- ============================================================================

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

  -- If actual check-in was only the planned ECI date (no later real check-in), clear it
  UPDATE public.student_applications
  SET
    actual_check_in_date = NULL,
    updated_at = NOW()
  WHERE id = p_application_id
    AND actual_check_in_date IS NOT NULL
    AND actual_check_in_date = v_eci.early_check_in_date
    AND checked_in_at IS NULL;

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

-- ============================================================================
-- 2. Helper: ECI remaining balance for an application
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_early_check_in_remaining(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT GREATEST(
      0,
      eci.total_amount - COALESCE((
        SELECT SUM(
          CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END
        )
        FROM public.early_check_in_payments p
        WHERE p.early_check_in_id = eci.id
      ), 0)
    )
    FROM public.early_check_ins eci
    WHERE eci.application_id = p_application_id
      AND eci.status = 'confirmed'
  ), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_early_check_in_remaining(UUID) TO authenticated;

-- ============================================================================
-- 3. AMEND BOOKING: sync or cancel ECI when contract_start changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_early_check_in_after_amend(
  p_application_id UUID,
  p_new_contract_start DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eci public.early_check_ins%ROWTYPE;
  v_nights INTEGER;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_eci
  FROM public.early_check_ins
  WHERE application_id = p_application_id
    AND status = 'confirmed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- New start on/before ECI arrival → cancel ECI (no nights left)
  IF p_new_contract_start <= v_eci.early_check_in_date THEN
    UPDATE public.early_check_ins
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancel_reason = 'Auto-cancelled: amended contract start is on or before early check-in date',
      updated_at = NOW()
    WHERE id = v_eci.id;

    UPDATE public.student_applications
    SET
      actual_check_in_date = NULL,
      updated_at = NOW()
    WHERE id = p_application_id
      AND actual_check_in_date = v_eci.early_check_in_date
      AND checked_in_at IS NULL;

    RETURN;
  END IF;

  -- Same end date → nothing to do
  IF p_new_contract_start = v_eci.early_check_out_date THEN
    RETURN;
  END IF;

  v_nights := (p_new_contract_start - v_eci.early_check_in_date);
  v_total := ROUND(v_eci.nightly_rate * v_nights, 2);

  UPDATE public.early_check_ins
  SET
    early_check_out_date = p_new_contract_start,
    nights = v_nights,
    total_amount = v_total,
    updated_at = NOW()
  WHERE id = v_eci.id;
END;
$$;

-- Patch amend function: call sync at end (recreate full function body from latest + sync)
-- We only append the sync call via a wrapper trigger on student_applications.contract_id change
-- Safer approach: AFTER UPDATE trigger when contract_id changes, look up new contract_start

CREATE OR REPLACE FUNCTION public.trg_sync_eci_on_application_contract_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE;
BEGIN
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id THEN
    SELECT contract_start::DATE INTO v_start
    FROM public.contracts
    WHERE id = NEW.contract_id;

    IF v_start IS NOT NULL THEN
      PERFORM public.sync_early_check_in_after_amend(NEW.id, v_start);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_applications_sync_eci_on_contract_change ON public.student_applications;
CREATE TRIGGER student_applications_sync_eci_on_contract_change
  AFTER UPDATE OF contract_id ON public.student_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_eci_on_application_contract_change();

-- ============================================================================
-- 4. UNIFIED PAYMENT HISTORY: include early_check_in_payments
-- ============================================================================

CREATE OR REPLACE VIEW public.unified_payment_history
WITH (security_invoker = true)
AS
 SELECT 'stripe'::text AS payment_source,
    sp.id AS payment_id,
    sp.student_application_id,
    sp.payment_plan_id,
    sp.amount AS amount_paid,
    sp.currency,
    sp.status AS payment_status,
    sp.stripe_payment_intent_id,
    sp.created_at AS payment_date,
    sp.updated_at,
    NULL::uuid AS manual_entry_id,
    NULL::text AS manual_entry_notes,
    NULL::uuid AS entered_by_user_id,
    sa.student_id,
        CASE
            WHEN (sp.metadata ->> 'instalment_id'::text) IS NOT NULL THEN ( SELECT cps.sequence
               FROM contract_payment_schedule cps
              WHERE cps.id::text = (sp.metadata ->> 'instalment_id'::text)
             LIMIT 1)
            ELSE NULL::smallint
        END AS installment_number,
        CASE
            WHEN (sp.metadata ->> 'instalment_id'::text) IS NOT NULL THEN ( SELECT cps.due_date
               FROM contract_payment_schedule cps
              WHERE cps.id::text = (sp.metadata ->> 'instalment_id'::text)
             LIMIT 1)
            ELSE NULL::date
        END AS due_date,
    c.id AS contract_id,
    c.name AS contract_name,
    ay.id AS academic_year_id,
    ay.name AS academic_year_name,
    COALESCE(sp.metadata ->> 'type'::text, 'instalment'::text) AS payment_type,
    sp.metadata AS payment_metadata,
    COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(p.first_name, ''::text) || ' '::text) || COALESCE(p.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM (COALESCE(step1.payload ->> 'first_name'::text, ''::text) || ' '::text) || COALESCE(step1.payload ->> 'last_name'::text, ''::text)), ''::text), 'Unknown student'::text) AS student_name,
    s.studio_number,
    sg.name AS studio_grade
   FROM stripe_payments sp
     JOIN student_applications sa ON sp.student_application_id = sa.id
     LEFT JOIN contracts c ON sa.contract_id = c.id
     LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
     LEFT JOIN profiles p ON p.id = sa.student_id
     LEFT JOIN studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN LATERAL ( SELECT sas.payload
           FROM student_application_steps sas
          WHERE sas.application_id = sa.id AND sas.step_number = 1
          ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
         LIMIT 1) step1 ON true
  WHERE sp.status = ANY (ARRAY['succeeded'::text, 'completed'::text])
UNION ALL
 SELECT 'manual'::text AS payment_source,
    mp.id AS payment_id,
    mp.application_id AS student_application_id,
    NULL::uuid AS payment_plan_id,
    mp.amount AS amount_paid,
    'GBP'::text AS currency,
    'completed'::text AS payment_status,
    NULL::text AS stripe_payment_intent_id,
    mp.payment_date::timestamp with time zone AS payment_date,
    mp.updated_at,
    mp.id AS manual_entry_id,
    mp.notes AS manual_entry_notes,
    mp.recorded_by AS entered_by_user_id,
    sa.student_id,
    cps.sequence::integer AS installment_number,
    cps.due_date,
    c.id AS contract_id,
    c.name AS contract_name,
    ay.id AS academic_year_id,
    ay.name AS academic_year_name,
        CASE
            WHEN mp.payment_type = 'deposit'::text THEN 'deposit'::text
            ELSE 'instalment'::text
        END AS payment_type,
    jsonb_build_object('type', mp.payment_type, 'notes', mp.notes) AS payment_metadata,
    COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(p.first_name, ''::text) || ' '::text) || COALESCE(p.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM (COALESCE(step1.payload ->> 'first_name'::text, ''::text) || ' '::text) || COALESCE(step1.payload ->> 'last_name'::text, ''::text)), ''::text), 'Unknown student'::text) AS student_name,
    s.studio_number,
    sg.name AS studio_grade
   FROM manual_payments mp
     JOIN student_applications sa ON mp.application_id = sa.id
     LEFT JOIN contract_payment_schedule cps ON mp.instalment_id = cps.id
     LEFT JOIN contracts c ON sa.contract_id = c.id
     LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
     LEFT JOIN profiles p ON p.id = sa.student_id
     LEFT JOIN studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN LATERAL ( SELECT sas.payload
           FROM student_application_steps sas
          WHERE sas.application_id = sa.id AND sas.step_number = 1
          ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
         LIMIT 1) step1 ON true
UNION ALL
 SELECT 'early_check_in'::text AS payment_source,
    ecp.id AS payment_id,
    ecp.application_id AS student_application_id,
    NULL::uuid AS payment_plan_id,
    CASE WHEN ecp.payment_type = 'refund' THEN -ecp.amount ELSE ecp.amount END AS amount_paid,
    ecp.currency,
    'completed'::text AS payment_status,
    NULL::text AS stripe_payment_intent_id,
    ecp.payment_date::timestamp with time zone AS payment_date,
    ecp.updated_at,
    ecp.id AS manual_entry_id,
    ecp.notes AS manual_entry_notes,
    ecp.recorded_by AS entered_by_user_id,
    sa.student_id,
    NULL::integer AS installment_number,
    NULL::date AS due_date,
    c.id AS contract_id,
    c.name AS contract_name,
    ay.id AS academic_year_id,
    ay.name AS academic_year_name,
    'early_check_in'::text AS payment_type,
    jsonb_build_object(
      'type', 'early_check_in',
      'eci_payment_type', ecp.payment_type,
      'payment_method', ecp.payment_method,
      'reference_number', ecp.reference_number,
      'notes', ecp.notes,
      'early_check_in_id', ecp.early_check_in_id
    ) AS payment_metadata,
    COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(p.first_name, ''::text) || ' '::text) || COALESCE(p.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM (COALESCE(step1.payload ->> 'first_name'::text, ''::text) || ' '::text) || COALESCE(step1.payload ->> 'last_name'::text, ''::text)), ''::text), 'Unknown student'::text) AS student_name,
    s.studio_number,
    sg.name AS studio_grade
   FROM early_check_in_payments ecp
     JOIN student_applications sa ON ecp.application_id = sa.id
     LEFT JOIN contracts c ON sa.contract_id = c.id
     LEFT JOIN academic_years ay ON c.academic_year_id = ay.id
     LEFT JOIN profiles p ON p.id = sa.student_id
     LEFT JOIN studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN LATERAL ( SELECT sas.payload
           FROM student_application_steps sas
          WHERE sas.application_id = sa.id AND sas.step_number = 1
          ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC NULLS LAST
         LIMIT 1) step1 ON true;

GRANT SELECT ON public.unified_payment_history TO authenticated;

-- ============================================================================
-- 5. ECI PAYMENT LEDGER VIEW (OTA-style)
-- ============================================================================

CREATE OR REPLACE VIEW public.early_check_ins_payment_ledger
WITH (security_invoker = true)
AS
SELECT
  eci.id AS early_check_in_id,
  eci.application_id,
  eci.studio_id,
  eci.early_check_in_date,
  eci.early_check_out_date,
  eci.nights,
  eci.nightly_rate,
  eci.total_amount,
  eci.currency,
  eci.status AS eci_status,
  eci.notes,
  eci.created_at,
  sa.status AS application_status,
  sa.student_id,
  c.academic_year_id,
  ay.name AS academic_year_name,
  c.name AS contract_name,
  c.contract_start,
  s.studio_number,
  sg.name AS studio_grade,
  COALESCE(
    NULLIF(TRIM(BOTH FROM COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), ''),
    NULLIF(TRIM(BOTH FROM COALESCE(step1.payload->>'first_name', '') || ' ' || COALESCE(step1.payload->>'last_name', '')), ''),
    'Unknown student'
  ) AS student_name,
  ps.amount_due,
  ps.total_received,
  ps.remaining_balance,
  ps.payment_count,
  ps.last_payment_date,
  ps.payment_status
FROM public.early_check_ins eci
JOIN public.student_applications sa ON sa.id = eci.application_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.studios s ON s.id = eci.studio_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.profiles pr ON pr.id = sa.student_id
LEFT JOIN LATERAL (
  SELECT sas.payload
  FROM public.student_application_steps sas
  WHERE sas.application_id = sa.id AND sas.step_number = 1
  ORDER BY sas.updated_at DESC NULLS LAST
  LIMIT 1
) step1 ON true
CROSS JOIN LATERAL public.get_early_check_in_payment_summary(eci.application_id) ps;

GRANT SELECT ON public.early_check_ins_payment_ledger TO authenticated;

-- ============================================================================
-- 6. ACCOUNTS RECEIVABLE: add ECI outstanding columns
-- ============================================================================

CREATE OR REPLACE VIEW public.accounts_receivable_report
WITH (security_invoker = true)
AS
 SELECT sa.id AS application_id,
    sa.student_id,
    (p.first_name || ' '::text) || p.last_name AS student_name,
    sa.status AS application_status,
    c.name AS contract_name,
    sg.name AS studio_grade,
    sa.total_contract_value,
    COALESCE(ac.cashback_amount, 0::numeric) AS cashback_amount,
    COALESCE(sa.discount_amount, 0::numeric) AS discount_amount,
    COALESCE(sa.total_contract_value, 0::numeric) - COALESCE(ac.cashback_amount, 0::numeric) - COALESCE(sa.discount_amount, 0::numeric) AS adjusted_contract_value,
    COALESCE(ps.total_due, 0::numeric) AS total_due,
    COALESCE(ps.total_paid, 0::numeric) AS total_paid,
    COALESCE(ps.remaining_balance, 0::numeric) AS outstanding_balance,
    ps.payment_status,
    public.get_early_check_in_remaining(sa.id) AS early_check_in_outstanding,
    COALESCE(ps.remaining_balance, 0::numeric) + public.get_early_check_in_remaining(sa.id) AS total_outstanding,
    sa.assigned_studio_id,
    s.studio_number,
    sa.created_at AS application_date,
    c.contract_start,
    c.contract_end,
    ay.name AS academic_year_name,
    resolve_payment_plan_label(resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan
   FROM student_applications sa
     LEFT JOIN profiles p ON p.id = sa.student_id
     LEFT JOIN contracts c ON c.id = sa.contract_id
     LEFT JOIN studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN LATERAL ( SELECT ac2.cashback_amount
           FROM application_cashbacks ac2
          WHERE ac2.application_id = sa.id
          ORDER BY ac2.applied_at DESC
         LIMIT 1) ac ON true
     CROSS JOIN LATERAL get_payment_summary(sa.id) ps(total_due, total_paid, remaining_balance, payment_count, last_payment_date, payment_status)
  WHERE is_committed_sale_status(sa.status)
    AND (
      COALESCE(ps.remaining_balance, 0::numeric) > 0::numeric
      OR public.get_early_check_in_remaining(sa.id) > 0::numeric
    );

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

-- ============================================================================
-- 7. ROUTE PERMISSIONS for ECI ledger
-- ============================================================================

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'staff', true),
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'superadmin', true),
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'admin', true),
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'operations_manager', true),
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'reservationist', true),
  ('/admin/early-check-in-payments', 'Early Check-in Payments', 'accountant', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
