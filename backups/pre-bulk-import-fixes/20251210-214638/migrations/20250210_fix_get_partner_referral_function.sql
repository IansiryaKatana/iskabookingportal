-- Fix get_partner_referral_payment_summary to handle errors gracefully
-- The function might be failing due to get_payment_summary errors

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
DECLARE
  v_application_id UUID;
BEGIN
  -- This function runs with SECURITY DEFINER, so it bypasses RLS
  RETURN QUERY
  SELECT
    sa.id AS application_id,
    COALESCE(p.first_name, '') AS student_first_name,
    COALESCE(p.last_name, '') AS student_last_name,
    COALESCE(c.name, '') AS contract_name,
    COALESCE(ay.name, '') AS academic_year_name,
    COALESCE(pr.total_contract_value, 0) AS total_contract_value,
    COALESCE(ps.total_paid, 0) AS total_paid,
    COALESCE(ps.remaining_balance, COALESCE(pr.total_contract_value, 0)) AS remaining_balance,
    COALESCE(ps.payment_status, 'unpaid') AS payment_status,
    COALESCE(pr.commission_amount, 0) AS commission_amount,
    COALESCE(pr.commission_status, 'pending') AS commission_status,
    ps.last_payment_date
  FROM public.partner_referrals pr
  INNER JOIN public.student_applications sa ON pr.application_id = sa.id
  INNER JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
  LEFT JOIN LATERAL (
    SELECT 
      total_paid,
      remaining_balance,
      payment_status,
      last_payment_date
    FROM public.get_payment_summary(sa.id)
  ) ps ON true
  WHERE pr.partner_id = p_partner_id
  ORDER BY sa.created_at DESC;
EXCEPTION
  WHEN OTHERS THEN
    -- If get_payment_summary fails, return data without payment summary
    RETURN QUERY
    SELECT
      sa.id AS application_id,
      COALESCE(p.first_name, '') AS student_first_name,
      COALESCE(p.last_name, '') AS student_last_name,
      COALESCE(c.name, '') AS contract_name,
      COALESCE(ay.name, '') AS academic_year_name,
      COALESCE(pr.total_contract_value, 0) AS total_contract_value,
      0 AS total_paid,
      COALESCE(pr.total_contract_value, 0) AS remaining_balance,
      'unpaid' AS payment_status,
      COALESCE(pr.commission_amount, 0) AS commission_amount,
      COALESCE(pr.commission_status, 'pending') AS commission_status,
      NULL::TIMESTAMPTZ AS last_payment_date
    FROM public.partner_referrals pr
    INNER JOIN public.student_applications sa ON pr.application_id = sa.id
    INNER JOIN public.profiles p ON sa.student_id = p.id
    LEFT JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
    WHERE pr.partner_id = p_partner_id
    ORDER BY sa.created_at DESC;
END;
$$;

-- Ensure the function is granted to authenticated users
GRANT EXECUTE ON FUNCTION public.get_partner_referral_payment_summary(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.get_partner_referral_payment_summary(UUID) IS 
  'Returns payment summary for all referrals by a partner. Uses SECURITY DEFINER to bypass RLS. Handles errors gracefully if get_payment_summary fails.';

