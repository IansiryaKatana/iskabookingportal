-- Align Revenue Summary and Bank Reconciliation with unified_payment_history
-- Include both Stripe and manual payments by recognising:
--  - Stripe: status IN ('succeeded', 'completed')
--  - Manual: status = 'completed'
-- This ensures revenue and reconciliation reports stay in sync with
-- deposit/installment breakdown and payment summary logic.

-- ============================================================================
-- 1. Update get_revenue_summary to include completed payments
-- ============================================================================

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
  total_revenue NUMERIC,
  payment_count BIGINT,
  stripe_revenue NUMERIC,
  manual_revenue NUMERIC,
  total_refunds NUMERIC,
  net_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
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
        WHEN COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit' THEN 'deposit'
        ELSE 'installment'
      END AS payment_type
    FROM public.unified_payment_history uph
    WHERE uph.payment_status IN ('succeeded', 'completed')
      AND uph.payment_date::DATE BETWEEN v_start AND v_end
  ),
  refund_data AS (
    -- Get refunds for the period (both Stripe and manual)
    SELECT 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', processed_at)::DATE
        ELSE 
          DATE_TRUNC('month', processed_at)::DATE
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
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_data.payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_data.payment_date)::DATE
      END AS period_start,
      SUM(CASE WHEN payment_data.payment_type = 'deposit' THEN payment_data.amount_paid ELSE 0 END) AS deposit_revenue,
      SUM(CASE WHEN payment_data.payment_type = 'installment' THEN payment_data.amount_paid ELSE 0 END) AS installment_revenue,
      SUM(payment_data.amount_paid) AS total_revenue,
      COUNT(*) AS payment_count,
      SUM(CASE WHEN payment_data.payment_source = 'stripe' THEN payment_data.amount_paid ELSE 0 END) AS stripe_revenue,
      SUM(CASE WHEN payment_data.payment_source = 'manual' THEN payment_data.amount_paid ELSE 0 END) AS manual_revenue
    FROM payment_data
    GROUP BY 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_data.payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_data.payment_date)::DATE
      END
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
      WHEN p_group_by = 'quarter' THEN 
        (period_data.period_start + INTERVAL '3 months - 1 day')::DATE
      ELSE 
        (period_data.period_start + INTERVAL '1 month - 1 day')::DATE
    END AS period_end,
    period_data.deposit_revenue,
    period_data.installment_revenue,
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

COMMENT ON FUNCTION public.get_revenue_summary(DATE, DATE, TEXT) IS
  'Revenue Summary Report - Shows gross and net revenue by month/quarter with breakdown by payment type. Includes Stripe and manual payments with statuses succeeded/completed, and subtracts refunds for net revenue.';

GRANT EXECUTE ON FUNCTION public.get_revenue_summary(DATE, DATE, TEXT) TO authenticated;

-- ============================================================================
-- 2. Update bank_reconciliation_report to include completed payments
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
    WHEN COALESCE(uph.payment_metadata->>'type', uph.payment_type) = 'deposit' THEN 'Deposit'
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
LEFT JOIN public.profiles p ON p.id = sa.student_id
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE uph.payment_status IN ('succeeded', 'completed')
ORDER BY uph.payment_date DESC;

GRANT SELECT ON public.bank_reconciliation_report TO authenticated;

