-- Fix get_partner_referral_payment_summary - resolve payment_status ambiguity
-- Use explicit column selection to avoid ambiguous column reference

CREATE OR REPLACE FUNCTION public.get_partner_referral_payment_summary(p_partner_id UUID)
RETURNS TABLE (
  application_id UUID,
  student_first_name TEXT,
  student_last_name TEXT,
  contract_name TEXT,
  academic_year_name TEXT,
  total_contract_value NUMERIC,
  total_paid NUMERIC,
  remaining_balance NUMERIC,
  payment_status TEXT,
  commission_amount NUMERIC,
  commission_status TEXT,
  last_payment_date TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  WITH payment_data AS (
    SELECT 
      sa.id as app_id,
      payment_info.total_paid,
      payment_info.remaining_balance,
      payment_info.payment_status as ps_status,
      payment_info.last_payment_date
    FROM public.partner_referrals pr
    INNER JOIN public.student_applications sa ON pr.application_id = sa.id
    LEFT JOIN LATERAL (
      SELECT 
        total_paid,
        remaining_balance,
        payment_status,
        last_payment_date
      FROM public.get_payment_summary(sa.id)
    ) payment_info ON true
    WHERE pr.partner_id = p_partner_id
  )
  SELECT
    sa.id AS application_id,
    COALESCE(p.first_name, '') AS student_first_name,
    COALESCE(p.last_name, '') AS student_last_name,
    COALESCE(c.name, '') AS contract_name,
    COALESCE(ay.name, '') AS academic_year_name,
    COALESCE(pr.total_contract_value, 0) AS total_contract_value,
    COALESCE(pd.total_paid, 0) AS total_paid,
    COALESCE(pd.remaining_balance, COALESCE(pr.total_contract_value, 0)) AS remaining_balance,
    COALESCE(pd.ps_status, 'unpaid') AS payment_status,
    COALESCE(pr.commission_amount, 0) AS commission_amount,
    COALESCE(pr.commission_status, 'pending') AS commission_status,
    pd.last_payment_date
  FROM public.partner_referrals pr
  INNER JOIN public.student_applications sa ON pr.application_id = sa.id
  INNER JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
  LEFT JOIN payment_data pd ON pd.app_id = sa.id
  WHERE pr.partner_id = p_partner_id
  ORDER BY sa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_referral_payment_summary(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.get_partner_referral_payment_summary(UUID) IS 
  'Returns payment summary for all referrals by a partner. Uses SECURITY DEFINER to bypass RLS.';

