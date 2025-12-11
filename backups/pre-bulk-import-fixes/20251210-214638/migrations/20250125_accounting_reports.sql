-- Accounting Reports - Database Views and Functions
-- This migration creates views and functions for accounting reports:
-- 1. Accounts Receivable Report
-- 2. Revenue Summary Report (monthly/quarterly)
-- 3. Outstanding Balances Report
-- 4. Deposit vs Installment Breakdown
-- 5. Bank Reconciliation Report

-- ============================================================================
-- 1. ACCOUNTS RECEIVABLE REPORT VIEW
-- Shows all money owed to the company by students
-- ============================================================================
CREATE OR REPLACE VIEW public.accounts_receivable_report AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  COALESCE(ac.cashback_amount, 0) AS cashback_amount,
  COALESCE(sa.total_contract_value, 0) - COALESCE(ac.cashback_amount, 0) AS adjusted_contract_value,
  -- Get payment summary
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  ps.payment_status,
  sa.assigned_studio_id,
  s.studio_number,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end,
  ay.name AS academic_year_name
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
LEFT JOIN public.application_cashbacks ac ON ac.application_id = sa.id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

-- ============================================================================
-- 2. REVENUE SUMMARY REPORT FUNCTION
-- Shows revenue by month/quarter with breakdown by payment type
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_revenue_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_group_by TEXT DEFAULT 'month' -- 'month' or 'quarter'
)
RETURNS TABLE (
  period_label TEXT,
  period_start DATE,
  period_end DATE,
  deposit_revenue NUMERIC,
  installment_revenue NUMERIC,
  total_revenue NUMERIC,
  payment_count BIGINT,
  stripe_revenue NUMERIC,
  manual_revenue NUMERIC
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  -- Set default date range if not provided
  v_start := COALESCE(p_start_date, DATE_TRUNC('year', CURRENT_DATE));
  v_end := COALESCE(p_end_date, CURRENT_DATE);
  
  RETURN QUERY
  WITH payment_data AS (
    SELECT 
      uph.payment_date::DATE AS payment_date,
      uph.amount_paid,
      uph.payment_source,
      CASE 
        WHEN uph.payment_metadata->>'type' = 'deposit' THEN 'deposit'
        ELSE 'installment'
      END AS payment_type
    FROM public.unified_payment_history uph
    WHERE uph.payment_status = 'succeeded'
      AND uph.payment_date::DATE BETWEEN v_start AND v_end
  ),
  period_data AS (
    SELECT 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_date)::DATE
      END AS period_start,
      SUM(CASE WHEN payment_type = 'deposit' THEN amount_paid ELSE 0 END) AS deposit_revenue,
      SUM(CASE WHEN payment_type = 'installment' THEN amount_paid ELSE 0 END) AS installment_revenue,
      SUM(amount_paid) AS total_revenue,
      COUNT(*) AS payment_count,
      SUM(CASE WHEN payment_source = 'stripe' THEN amount_paid ELSE 0 END) AS stripe_revenue,
      SUM(CASE WHEN payment_source = 'manual' THEN amount_paid ELSE 0 END) AS manual_revenue
    FROM payment_data
    GROUP BY 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_date)::DATE
      END
  )
  SELECT 
    CASE 
      WHEN p_group_by = 'quarter' THEN 
        'Q' || TO_CHAR(period_start, 'Q') || ' ' || TO_CHAR(period_start, 'YYYY')
      ELSE 
        TO_CHAR(period_start, 'Month YYYY')
    END AS period_label,
    period_start,
    CASE 
      WHEN p_group_by = 'quarter' THEN 
        (period_start + INTERVAL '3 months - 1 day')::DATE
      ELSE 
        (period_start + INTERVAL '1 month - 1 day')::DATE
    END AS period_end,
    deposit_revenue,
    installment_revenue,
    total_revenue,
    payment_count,
    stripe_revenue,
    manual_revenue
  FROM period_data
  ORDER BY period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_summary(DATE, DATE, TEXT) TO authenticated;

-- ============================================================================
-- 3. OUTSTANDING BALANCES REPORT VIEW
-- Shows students with outstanding balances, grouped by age of debt
-- ============================================================================
CREATE OR REPLACE VIEW public.outstanding_balances_report AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  sa.status AS application_status,
  c.name AS contract_name,
  sg.name AS studio_grade,
  COALESCE(ps.total_due, 0) AS total_due,
  COALESCE(ps.total_paid, 0) AS total_paid,
  COALESCE(ps.remaining_balance, 0) AS outstanding_balance,
  -- Calculate age of oldest unpaid installment
  (
    SELECT MIN(cps.due_date)
    FROM public.contract_payment_schedule cps
    LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
      AND sp.status = 'succeeded'
    LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
    WHERE cps.contract_id = sa.contract_id
      AND sp.id IS NULL 
      AND mp.id IS NULL
      AND cps.due_date < CURRENT_DATE
  ) AS oldest_unpaid_due_date,
  CASE 
    WHEN (
      SELECT MIN(cps.due_date)
      FROM public.contract_payment_schedule cps
      LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
        AND sp.status = 'succeeded'
      LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
      WHERE cps.contract_id = sa.contract_id
        AND sp.id IS NULL 
        AND mp.id IS NULL
        AND cps.due_date < CURRENT_DATE
    ) IS NOT NULL THEN
      CURRENT_DATE - (
        SELECT MIN(cps.due_date)
        FROM public.contract_payment_schedule cps
        LEFT JOIN public.stripe_payments sp ON sp.metadata->>'instalment_id' = cps.id::text 
          AND sp.status = 'succeeded'
        LEFT JOIN public.manual_payments mp ON mp.instalment_id = cps.id
        WHERE cps.contract_id = sa.contract_id
          AND sp.id IS NULL 
          AND mp.id IS NULL
          AND cps.due_date < CURRENT_DATE
      )
    ELSE 0
  END AS days_overdue,
  sa.created_at AS application_date,
  c.contract_start,
  c.contract_end
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature')
  AND COALESCE(ps.remaining_balance, 0) > 0;

GRANT SELECT ON public.outstanding_balances_report TO authenticated;

-- ============================================================================
-- 4. DEPOSIT VS INSTALLMENT BREAKDOWN VIEW
-- Shows breakdown of deposit vs installment payments
-- ============================================================================
CREATE OR REPLACE VIEW public.deposit_installment_breakdown AS
SELECT 
  sa.id AS application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  c.name AS contract_name,
  sg.name AS studio_grade,
  sa.total_contract_value,
  -- Deposit information
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS deposit_paid,
  COALESCE(pp.deposit_amount, 0) AS expected_deposit,
  -- Installment information
  COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS installments_paid,
  COALESCE(ps.total_due, 0) - COALESCE((
    SELECT SUM(amount_paid)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ), 0) AS expected_installments,
  -- Payment counts
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' = 'deposit'
      AND payment_status = 'succeeded'
  ) AS deposit_payment_count,
  (
    SELECT COUNT(*)
    FROM public.unified_payment_history
    WHERE student_application_id = sa.id
      AND payment_metadata->>'type' != 'deposit'
      AND payment_status = 'succeeded'
  ) AS installment_payment_count,
  sa.status,
  sa.created_at AS application_date
FROM public.student_applications sa
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
WHERE sa.status IN ('confirmed', 'awaiting_deposit', 'awaiting_signature');

GRANT SELECT ON public.deposit_installment_breakdown TO authenticated;

-- ============================================================================
-- 5. BANK RECONCILIATION REPORT VIEW
-- Shows all payments with their source (Stripe vs Manual) for bank reconciliation
-- ============================================================================
CREATE OR REPLACE VIEW public.bank_reconciliation_report AS
SELECT 
  uph.payment_id,
  uph.payment_source,
  uph.student_application_id,
  sa.student_id,
  p.first_name || ' ' || p.last_name AS student_name,
  uph.amount_paid,
  uph.currency,
  uph.payment_status,
  uph.payment_date,
  -- Stripe specific fields
  uph.stripe_payment_intent_id,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 'Stripe'
    ELSE 'Manual Entry'
  END AS payment_method,
  -- Manual payment specific fields
  uph.manual_entry_notes,
  uph.entered_by_user_id,
  CASE 
    WHEN uph.payment_source = 'manual' THEN 
      (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = uph.entered_by_user_id)
    ELSE NULL
  END AS entered_by_name,
  -- Payment type
  CASE 
    WHEN uph.payment_metadata->>'type' = 'deposit' THEN 'Deposit'
    ELSE 'Installment'
  END AS payment_type,
  -- Application details
  c.name AS contract_name,
  sg.name AS studio_grade,
  -- Invoice information
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_number FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_number FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_number,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_generated_at FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_generated_at FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_generated_at
FROM public.unified_payment_history uph
LEFT JOIN public.student_applications sa ON sa.id = uph.student_application_id
LEFT JOIN public.profiles p ON p.id = uph.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE uph.payment_status = 'succeeded'
ORDER BY uph.payment_date DESC;

GRANT SELECT ON public.bank_reconciliation_report TO authenticated;

COMMENT ON VIEW public.accounts_receivable_report IS 'Accounts Receivable Report - Shows all money owed to the company by students';
COMMENT ON FUNCTION public.get_revenue_summary(DATE, DATE, TEXT) IS 'Revenue Summary Report - Shows revenue by month/quarter with breakdown by payment type';
COMMENT ON VIEW public.outstanding_balances_report IS 'Outstanding Balances Report - Shows students with outstanding balances, grouped by age of debt';
COMMENT ON VIEW public.deposit_installment_breakdown IS 'Deposit vs Installment Breakdown - Shows breakdown of deposit vs installment payments';
COMMENT ON VIEW public.bank_reconciliation_report IS 'Bank Reconciliation Report - Shows all payments with their source (Stripe vs Manual) for bank reconciliation';

