-- Fix referral code validation - Make function SECURITY DEFINER
-- This allows the function to bypass RLS when validating referral codes
-- so students can validate codes without needing direct access to partners table

CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  partner_id UUID,
  partner_name TEXT,
  commission_percentage NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
  v_partner_name TEXT;
  v_commission_percentage NUMERIC;
BEGIN
  -- Normalize code (uppercase, trim)
  p_code := UPPER(TRIM(p_code));
  
  -- Check if code exists and partner is active
  SELECT p.id, p.name, p.commission_percentage
  INTO v_partner_id, v_partner_name, v_commission_percentage
  FROM public.partners p
  WHERE UPPER(TRIM(p.referral_code)) = p_code
    AND p.is_active = true;
  
  IF v_partner_id IS NOT NULL THEN
    RETURN QUERY SELECT
      true::BOOLEAN AS is_valid,
      v_partner_id::UUID AS partner_id,
      v_partner_name::TEXT AS partner_name,
      v_commission_percentage::NUMERIC AS commission_percentage;
  ELSE
    RETURN QUERY SELECT
      false::BOOLEAN AS is_valid,
      NULL::UUID AS partner_id,
      NULL::TEXT AS partner_name,
      NULL::NUMERIC AS commission_percentage;
  END IF;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.validate_referral_code(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.validate_referral_code(TEXT) IS 
'Validates a referral code and returns partner information if valid. 
Uses SECURITY DEFINER to bypass RLS so students can validate codes without direct access to partners table.';

-- Also fix check_referral_code_available function
CREATE OR REPLACE FUNCTION public.check_referral_code_available(p_referral_code TEXT)
RETURNS TABLE (
  is_available BOOLEAN,
  partner_id UUID,
  partner_name TEXT,
  is_already_linked BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
  v_partner_name TEXT;
  v_is_linked BOOLEAN;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id, name INTO v_partner_id, v_partner_name
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true;
  
  IF v_partner_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;
  
  -- Check if already linked
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE partner_id = v_partner_id
  ) INTO v_is_linked;
  
  RETURN QUERY SELECT 
    NOT v_is_linked AS is_available,
    v_partner_id,
    v_partner_name,
    v_is_linked;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_referral_code_available(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.check_referral_code_available(TEXT) IS 
'Checks if a referral code is available (not already linked to another account). 
Uses SECURITY DEFINER to bypass RLS so users can check codes without direct access to partners table.';

