-- Bank reconciliation via RPC so all rows are returned (PostgREST caps .from() at max-rows, default 1000).

CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_report(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  payment_id UUID,
  payment_source TEXT,
  student_application_id UUID,
  student_id UUID,
  student_name TEXT,
  amount_paid NUMERIC,
  currency TEXT,
  payment_status TEXT,
  payment_date TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  payment_method TEXT,
  manual_entry_notes TEXT,
  entered_by_user_id UUID,
  entered_by_name TEXT,
  payment_type TEXT,
  contract_name TEXT,
  studio_grade TEXT,
  invoice_number TEXT,
  invoice_generated_at TIMESTAMPTZ,
  payment_plan TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.get_bank_reconciliation_report(DATE, DATE) IS
  'Bank Reconciliation Report — all Stripe and manual payments for the date range. Use RPC to avoid PostgREST max-rows cap on the underlying view.';

GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_report(DATE, DATE) TO authenticated;
