-- Dashboard stats: upcoming instalments should reflect unpaid/remaining amounts only.
-- This aligns the dashboard KPI with finance workflows where fully paid instalments
-- should not appear in the "upcoming" figure.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(p_academic_year_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_students bigint,
  total_applications bigint,
  confirmed_applications bigint,
  recent_applications bigint,
  total_revenue numeric,
  occupancy_total bigint,
  occupancy_occupied bigint,
  occupancy_percentage numeric,
  upcoming_instalments_count bigint,
  upcoming_instalments_total numeric,
  upcoming_instalments_next_due date,
  pending_verifications bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_ids uuid[] := NULL;
  v_occupancy_total bigint := 0;
  v_occupancy_occupied bigint := 0;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_academic_year_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(id), array[]::uuid[])
      INTO v_contract_ids
      FROM public.contracts
      WHERE academic_year_id = p_academic_year_id;
  END IF;

  -- Total students
  IF p_academic_year_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT sa.student_id)::bigint
      INTO total_students
      FROM public.student_applications sa
      WHERE sa.contract_id = ANY(v_contract_ids);
  ELSE
    SELECT COUNT(*)
      INTO total_students
      FROM public.profiles
      WHERE role = 'student';
  END IF;

  -- Application stats
  IF p_academic_year_id IS NOT NULL THEN
    SELECT
      COUNT(*)::bigint,
      COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
      COUNT(*) FILTER (WHERE created_at >= (NOW() - INTERVAL '7 days'))::bigint
    INTO
      total_applications,
      confirmed_applications,
      recent_applications
    FROM public.student_applications
    WHERE contract_id = ANY(v_contract_ids);
  ELSE
    SELECT
      COUNT(*)::bigint,
      COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
      COUNT(*) FILTER (WHERE created_at >= (NOW() - INTERVAL '7 days'))::bigint
    INTO
      total_applications,
      confirmed_applications,
      recent_applications
    FROM public.student_applications;
  END IF;

  -- Total revenue
  IF p_academic_year_id IS NOT NULL THEN
    SELECT COALESCE(SUM(uph.amount_paid), 0)
      INTO total_revenue
      FROM public.unified_payment_history uph
      WHERE uph.payment_status IN ('completed', 'succeeded')
        AND uph.contract_id = ANY(v_contract_ids);
  ELSE
    SELECT COALESCE(SUM(amount_paid), 0)
      INTO total_revenue
      FROM public.unified_payment_history
      WHERE payment_status IN ('completed', 'succeeded');
  END IF;

  -- Occupancy: total is always all active studios. Occupied is year-scoped when selected.
  SELECT COUNT(*)::bigint
    INTO v_occupancy_total
    FROM public.studios
    WHERE is_active IS TRUE;

  IF p_academic_year_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT sa.assigned_studio_id)::bigint
      INTO v_occupancy_occupied
      FROM public.student_applications sa
      INNER JOIN public.contracts c ON c.id = sa.contract_id
      WHERE sa.status = 'confirmed'
        AND c.academic_year_id = p_academic_year_id
        AND sa.assigned_studio_id IS NOT NULL;
  ELSE
    SELECT COUNT(*)::bigint
      INTO v_occupancy_occupied
      FROM public.studios
      WHERE is_active IS TRUE
        AND status = 'occupied';
  END IF;

  occupancy_total := COALESCE(v_occupancy_total, 0);
  occupancy_occupied := COALESCE(v_occupancy_occupied, 0);
  occupancy_percentage :=
    CASE
      WHEN occupancy_total > 0
        THEN ROUND((occupancy_occupied::numeric / occupancy_total) * 100)
      ELSE 0
    END;

  -- Upcoming instalments (next 30 days): unpaid/remaining only.
  WITH installment_due AS (
    SELECT
      cps.id AS schedule_id,
      cps.due_date,
      cps.amount::numeric AS scheduled_amount,
      (
        COALESCE((
          SELECT SUM(sp.amount)
          FROM public.stripe_payments sp
          WHERE sp.metadata->>'instalment_id' = cps.id::text
            AND sp.status IN ('succeeded', 'completed')
        ), 0)
        +
        COALESCE((
          SELECT SUM(mp.amount)
          FROM public.manual_payments mp
          WHERE mp.instalment_id = cps.id
        ), 0)
      )::numeric AS paid_amount
    FROM public.contract_payment_schedule cps
    WHERE cps.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
      AND (
        p_academic_year_id IS NULL
        OR cps.contract_id = ANY(v_contract_ids)
      )
  ),
  installment_remaining AS (
    SELECT
      schedule_id,
      due_date,
      GREATEST(scheduled_amount - paid_amount, 0)::numeric AS remaining_amount
    FROM installment_due
  )
  SELECT
    COUNT(*) FILTER (WHERE remaining_amount > 0.01)::bigint,
    COALESCE(SUM(remaining_amount) FILTER (WHERE remaining_amount > 0.01), 0)::numeric,
    MIN(due_date) FILTER (WHERE remaining_amount > 0.01)
  INTO
    upcoming_instalments_count,
    upcoming_instalments_total,
    upcoming_instalments_next_due
  FROM installment_remaining;

  -- Pending verifications
  IF p_academic_year_id IS NOT NULL THEN
    SELECT COUNT(*)::bigint
      INTO pending_verifications
      FROM public.student_documents sd
      INNER JOIN public.student_applications sa ON sd.application_id = sa.id
      WHERE sd.status = 'pending'
        AND sa.contract_id = ANY(v_contract_ids);
  ELSE
    SELECT COUNT(*)::bigint
      INTO pending_verifications
      FROM public.student_documents
      WHERE status = 'pending';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(total_students, 0),
    COALESCE(total_applications, 0),
    COALESCE(confirmed_applications, 0),
    COALESCE(recent_applications, 0),
    COALESCE(total_revenue, 0),
    COALESCE(occupancy_total, 0),
    COALESCE(occupancy_occupied, 0),
    COALESCE(occupancy_percentage, 0),
    COALESCE(upcoming_instalments_count, 0),
    COALESCE(upcoming_instalments_total, 0),
    upcoming_instalments_next_due,
    COALESCE(pending_verifications, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admin_dashboard_stats(uuid) IS
'Admin dashboard stats. Occupancy total is always all active studios; occupied is year-scoped. Upcoming instalments include only unpaid remaining balances due within 30 days.';
