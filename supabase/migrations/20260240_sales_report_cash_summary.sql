-- Sales report cash summary: total received, deposits collected, installments collected
-- Used by Sales & Demographics page (same academic year scope as report).
-- Only staff can call this function.

CREATE OR REPLACE FUNCTION public.get_sales_report_cash_summary(p_academic_year_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_received numeric,
  total_deposits_collected numeric,
  total_installments_collected numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(uph.amount_paid), 0)::numeric AS total_received,
    COALESCE(SUM(uph.amount_paid) FILTER (WHERE uph.payment_type = 'deposit'), 0)::numeric AS total_deposits_collected,
    COALESCE(SUM(uph.amount_paid) FILTER (WHERE uph.payment_type IS DISTINCT FROM 'deposit'), 0)::numeric AS total_installments_collected
  FROM public.unified_payment_history uph
  WHERE uph.payment_status IN ('succeeded', 'completed')
    AND (p_academic_year_id IS NULL OR uph.academic_year_id = p_academic_year_id);
END;
$$;

COMMENT ON FUNCTION public.get_sales_report_cash_summary(uuid) IS 'Cash summary for Sales & Demographics: total received, deposits collected, installments collected (optional academic year filter). Staff only.';

GRANT EXECUTE ON FUNCTION public.get_sales_report_cash_summary(uuid) TO authenticated;
