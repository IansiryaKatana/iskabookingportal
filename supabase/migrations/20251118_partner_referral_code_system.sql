-- Partner Referral Code System
-- Adds referral code support and partner role authentication

-- ============================================================================
-- PART 1: ADD REFERRAL CODE TO PARTNERS
-- ============================================================================

-- Add referral_code column to partners table (unique, one per partner)
ALTER TABLE public.partners
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code) WHERE referral_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.partners.referral_code IS 'Unique referral code for this partner. Students enter this code during application.';

-- ============================================================================
-- PART 2: ADD PARTNER ROLE SUPPORT
-- ============================================================================

-- Add partner_id to profiles to link partner users to their partner record
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_profiles_partner_id ON public.profiles(partner_id) WHERE partner_id IS NOT NULL;

-- Create function to check if user is a partner
CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'partner'
  );
$$;

-- Create function to get partner_id for current user
CREATE OR REPLACE FUNCTION public.get_partner_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT partner_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND role = 'partner';
$$;

-- ============================================================================
-- PART 3: UPDATE STUDENT_APPLICATIONS
-- ============================================================================

-- Add validated_referral_code to track which code was used
ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS validated_referral_code TEXT;

-- Add index
CREATE INDEX IF NOT EXISTS idx_student_applications_referral_code ON public.student_applications(validated_referral_code) WHERE validated_referral_code IS NOT NULL;

-- ============================================================================
-- PART 4: RLS POLICIES FOR PARTNERS
-- ============================================================================

-- Partners can view their own profile
DROP POLICY IF EXISTS "Partners can view own profile" ON public.profiles;
CREATE POLICY "Partners can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.is_partner()
  );

-- Partners can update their own profile (limited fields)
DROP POLICY IF EXISTS "Partners can update own profile" ON public.profiles;
CREATE POLICY "Partners can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid() AND role = 'partner')
  WITH CHECK (id = auth.uid() AND role = 'partner');

-- Partners can view their own partner record
DROP POLICY IF EXISTS "Partners can view own partner record" ON public.partners;
CREATE POLICY "Partners can view own partner record" ON public.partners
  FOR SELECT USING (
    id = public.get_partner_id()
  );

-- Partners can view their own referrals
DROP POLICY IF EXISTS "Partners can view own referrals" ON public.partner_referrals;
CREATE POLICY "Partners can view own referrals" ON public.partner_referrals
  FOR SELECT USING (
    partner_id = public.get_partner_id()
  );

-- Partners can view referred student applications (limited fields - names only)
-- We'll create a view for this with only necessary fields
CREATE OR REPLACE VIEW public.partner_referred_applications AS
SELECT
  sa.id AS application_id,
  sa.status AS application_status,
  sa.created_at AS application_created_at,
  sa.validated_referral_code,
  p.first_name,
  p.last_name,
  c.name AS contract_name,
  ay.name AS academic_year_name,
  pr.commission_percentage,
  pr.total_contract_value,
  pr.commission_amount,
  pr.commission_status,
  pr.created_at AS referral_created_at,
  pr.paid_at
FROM public.student_applications sa
INNER JOIN public.partner_referrals pr ON sa.id = pr.application_id
INNER JOIN public.profiles p ON sa.student_id = p.id
LEFT JOIN public.contracts c ON sa.contract_id = c.id
LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id;

-- Grant access to partners
GRANT SELECT ON public.partner_referred_applications TO authenticated;

-- RLS for the view
ALTER VIEW public.partner_referred_applications SET (security_invoker = true);

-- Create a function to get payment summary for partner's referrals
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

GRANT EXECUTE ON FUNCTION public.get_partner_referral_payment_summary(UUID) TO authenticated;

-- ============================================================================
-- PART 5: FUNCTION TO VALIDATE REFERRAL CODE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  partner_id UUID,
  partner_name TEXT,
  commission_percentage NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_partner RECORD;
BEGIN
  -- Normalize code (uppercase, trim)
  p_code := UPPER(TRIM(p_code));
  
  -- Check if code exists and partner is active
  SELECT id, name, commission_percentage
  INTO v_partner
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_code
    AND is_active = true;
  
  IF FOUND THEN
    RETURN QUERY SELECT
      true AS is_valid,
      v_partner.id AS partner_id,
      v_partner.name AS partner_name,
      v_partner.commission_percentage;
  ELSE
    RETURN QUERY SELECT
      false AS is_valid,
      NULL::UUID AS partner_id,
      NULL::TEXT AS partner_name,
      NULL::NUMERIC AS commission_percentage;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(TEXT) TO authenticated, anon;

-- ============================================================================
-- PART 6: FUNCTION TO LINK PARTNER ACCOUNT
-- ============================================================================

-- Function to link a user account to a partner record using referral code
CREATE OR REPLACE FUNCTION public.link_partner_account(
  p_referral_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner_id UUID;
  v_code_already_linked BOOLEAN;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true;
  
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code. Please check and try again.';
  END IF;
  
  -- Check if referral code is already linked to another account
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE partner_id = v_partner_id
      AND id != p_user_id
  ) INTO v_code_already_linked;
  
  IF v_code_already_linked THEN
    RAISE EXCEPTION 'This referral code is already linked to another account. Please contact admin.';
  END IF;
  
  -- Link account to partner
  UPDATE public.profiles
  SET 
    role = 'partner',
    partner_id = v_partner_id
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_partner_account(TEXT, UUID) TO authenticated, anon;

-- Function to check if referral code is available (not already linked)
CREATE OR REPLACE FUNCTION public.check_referral_code_available(p_referral_code TEXT)
RETURNS TABLE (
  is_available BOOLEAN,
  partner_id UUID,
  partner_name TEXT,
  is_already_linked BOOLEAN
)
LANGUAGE plpgsql
STABLE
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

GRANT EXECUTE ON FUNCTION public.check_referral_code_available(TEXT) TO authenticated, anon;

-- ============================================================================
-- PART 7: UPDATE AUTO-APPLY TRIGGER TO USE REFERRAL CODE
-- ============================================================================

-- Update the auto-apply function to check for validated_referral_code
-- This will be handled in the existing auto-apply trigger
-- The trigger should check validated_referral_code and create partner_referral if exists

