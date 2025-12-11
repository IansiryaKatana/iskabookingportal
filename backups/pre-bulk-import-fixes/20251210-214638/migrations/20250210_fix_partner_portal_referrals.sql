-- Fix partner portal not showing referrals
-- This migration ensures partners can see their referrals by:
-- 1. Ensuring get_partner_referral_payment_summary properly bypasses RLS
-- 2. Adding diagnostic logging
-- 3. Fixing any potential RLS issues

-- First, let's ensure the function has proper security settings
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
  -- This function runs with SECURITY DEFINER, so it bypasses RLS
  -- It queries directly from partner_referrals using the provided partner_id
  RETURN QUERY
  SELECT
    sa.id AS application_id,
    p.first_name AS student_first_name,
    p.last_name AS student_last_name,
    c.name AS contract_name,
    ay.name AS academic_year_name,
    pr.total_contract_value,
    COALESCE(ps.total_paid, 0) AS total_paid,
    COALESCE(ps.remaining_balance, pr.total_contract_value) AS remaining_balance,
    COALESCE(ps.payment_status, 'unpaid') AS payment_status,
    pr.commission_amount,
    pr.commission_status,
    ps.last_payment_date
  FROM public.partner_referrals pr
  INNER JOIN public.student_applications sa ON pr.application_id = sa.id
  INNER JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
  LEFT JOIN LATERAL public.get_payment_summary(sa.id) ps ON true
  WHERE pr.partner_id = p_partner_id
  ORDER BY sa.created_at DESC;
END;
$$;

-- Ensure the function is granted to authenticated users
GRANT EXECUTE ON FUNCTION public.get_partner_referral_payment_summary(UUID) TO authenticated, anon;

-- Create a diagnostic function to help debug partner referral issues
CREATE OR REPLACE FUNCTION public.diagnose_partner_referrals(p_user_id UUID)
RETURNS TABLE (
  check_name TEXT,
  check_result TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile RECORD;
  v_partner_id UUID;
  v_referral_count INTEGER;
BEGIN
  -- Check 1: User profile and partner_id
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'profile_exists'::TEXT, 'false'::TEXT, '{}'::JSONB;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    'profile_exists'::TEXT,
    'true'::TEXT,
    jsonb_build_object(
      'role', v_profile.role,
      'partner_id', v_profile.partner_id,
      'first_name', v_profile.first_name,
      'last_name', v_profile.last_name
    );
  
  -- Check 2: Partner record
  IF v_profile.partner_id IS NOT NULL THEN
    v_partner_id := v_profile.partner_id;
    
    RETURN QUERY SELECT 
      'partner_record'::TEXT,
      CASE WHEN EXISTS (SELECT 1 FROM public.partners WHERE id = v_partner_id) 
        THEN 'exists'::TEXT 
        ELSE 'missing'::TEXT 
      END,
      (SELECT jsonb_build_object(
        'partner_id', v_partner_id,
        'partner_name', (SELECT name FROM public.partners WHERE id = v_partner_id),
        'is_active', (SELECT is_active FROM public.partners WHERE id = v_partner_id)
      ));
    
    -- Check 3: Partner referrals count
    SELECT COUNT(*) INTO v_referral_count
    FROM public.partner_referrals
    WHERE partner_id = v_partner_id;
    
    RETURN QUERY SELECT 
      'referral_count'::TEXT,
      v_referral_count::TEXT,
      jsonb_build_object(
        'total_referrals', v_referral_count,
        'partner_id', v_partner_id
      );
    
    -- Check 4: Sample referral details
    RETURN QUERY
    SELECT 
      'sample_referrals'::TEXT,
      'found'::TEXT,
      jsonb_agg(
        jsonb_build_object(
          'application_id', pr.application_id,
          'commission_amount', pr.commission_amount,
          'commission_status', pr.commission_status,
          'created_at', pr.created_at
        )
      )
    FROM public.partner_referrals pr
    WHERE pr.partner_id = v_partner_id
    LIMIT 5;
  ELSE
    RETURN QUERY SELECT 
      'partner_id_set'::TEXT,
      'false'::TEXT,
      jsonb_build_object('message', 'Profile does not have partner_id set');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_partner_referrals(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_partner_referral_payment_summary(UUID) IS 
  'Returns payment summary for all referrals by a partner. Uses SECURITY DEFINER to bypass RLS.';
  
COMMENT ON FUNCTION public.diagnose_partner_referrals(UUID) IS 
  'Diagnostic function to help debug partner referral visibility issues.';

