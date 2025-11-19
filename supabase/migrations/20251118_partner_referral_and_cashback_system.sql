-- Partner Referral & Cashback System
-- This migration creates the foundation for partner referral commissions and cashback campaigns

-- ============================================================================
-- PART 1: PARTNER REFERRAL SYSTEM
-- ============================================================================

-- Partners table - stores partner information and commission rates
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00, -- Configurable, default 5%
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partner referrals table - tracks which applications are referred by partners
CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  referral_code TEXT, -- Optional: tracking code
  commission_percentage NUMERIC(5,2) NOT NULL, -- Snapshot at time of referral
  total_contract_value NUMERIC(10,2) NOT NULL, -- Snapshot of contract value
  commission_amount NUMERIC(10,2) NOT NULL, -- Calculated: total_contract_value × commission_percentage
  commission_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'cancelled'
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id), -- Staff who marked as paid
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id) -- One partner referral per application
);

-- Add partner referral column to student_applications
ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 2: CASHBACK SYSTEM
-- ============================================================================

-- Cashback campaigns table - stores campaign definitions
CREATE TABLE IF NOT EXISTS public.cashback_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Summer 2025 Cashback"
  description TEXT,
  cashback_amount NUMERIC(10,2) NOT NULL, -- e.g., 500.00
  applies_to TEXT NOT NULL DEFAULT 'all', -- 'all', 'new', 'rebooking'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER, -- Optional: limit number of uses
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cashback_campaigns_date_check CHECK (start_date <= end_date),
  CONSTRAINT cashback_campaigns_applies_to_check CHECK (applies_to IN ('all', 'new', 'rebooking'))
);

-- Application cashbacks table - tracks which applications have cashback applied
CREATE TABLE IF NOT EXISTS public.application_cashbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.cashback_campaigns(id) ON DELETE RESTRICT,
  cashback_amount NUMERIC(10,2) NOT NULL, -- Snapshot of amount at time of application
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id), -- Staff who applied it (or system)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id) -- One cashback per application
);

-- Add denormalized cashback amount to student_applications for quick access
ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS cashback_amount NUMERIC(10,2) DEFAULT 0;

-- ============================================================================
-- PART 3: INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_partners_active ON public.partners(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner ON public.partner_referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_application ON public.partner_referrals(application_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_status ON public.partner_referrals(commission_status);
CREATE INDEX IF NOT EXISTS idx_student_applications_partner ON public.student_applications(referred_by_partner_id);

CREATE INDEX IF NOT EXISTS idx_cashback_campaigns_active ON public.cashback_campaigns(is_active, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cashback_campaigns_dates ON public.cashback_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_application_cashbacks_application ON public.application_cashbacks(application_id);
CREATE INDEX IF NOT EXISTS idx_application_cashbacks_campaign ON public.application_cashbacks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_student_applications_cashback ON public.student_applications(cashback_amount) WHERE cashback_amount > 0;

-- ============================================================================
-- PART 4: RLS POLICIES
-- ============================================================================

-- Partners table
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all partners" ON public.partners;
CREATE POLICY "Staff can view all partners" ON public.partners
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage partners" ON public.partners;
CREATE POLICY "Staff can manage partners" ON public.partners
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Partner referrals table
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all partner referrals" ON public.partner_referrals;
CREATE POLICY "Staff can view all partner referrals" ON public.partner_referrals
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage partner referrals" ON public.partner_referrals;
CREATE POLICY "Staff can manage partner referrals" ON public.partner_referrals
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Students can view their own partner referral (if applicable)
DROP POLICY IF EXISTS "Students can view their own partner referral" ON public.partner_referrals;
CREATE POLICY "Students can view their own partner referral" ON public.partner_referrals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = partner_referrals.application_id
        AND sa.student_id = auth.uid()
    )
  );

-- Cashback campaigns table
ALTER TABLE public.cashback_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all cashback campaigns" ON public.cashback_campaigns;
CREATE POLICY "Staff can view all cashback campaigns" ON public.cashback_campaigns
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage cashback campaigns" ON public.cashback_campaigns;
CREATE POLICY "Staff can manage cashback campaigns" ON public.cashback_campaigns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Students can view active cashback campaigns
DROP POLICY IF EXISTS "Students can view active cashback campaigns" ON public.cashback_campaigns;
CREATE POLICY "Students can view active cashback campaigns" ON public.cashback_campaigns
  FOR SELECT USING (
    is_active = true
    AND start_date <= CURRENT_DATE
    AND end_date >= CURRENT_DATE
  );

-- Application cashbacks table
ALTER TABLE public.application_cashbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all application cashbacks" ON public.application_cashbacks;
CREATE POLICY "Staff can view all application cashbacks" ON public.application_cashbacks
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage application cashbacks" ON public.application_cashbacks;
CREATE POLICY "Staff can manage application cashbacks" ON public.application_cashbacks
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Students can view their own application cashback
DROP POLICY IF EXISTS "Students can view their own application cashback" ON public.application_cashbacks;
CREATE POLICY "Students can view their own application cashback" ON public.application_cashbacks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = application_cashbacks.application_id
        AND sa.student_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5: TRIGGERS
-- ============================================================================

-- Update timestamps
DROP TRIGGER IF EXISTS set_timestamp_partners ON public.partners;
CREATE TRIGGER set_timestamp_partners
BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_partner_referrals ON public.partner_referrals;
CREATE TRIGGER set_timestamp_partner_referrals
BEFORE UPDATE ON public.partner_referrals
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_cashback_campaigns ON public.cashback_campaigns;
CREATE TRIGGER set_timestamp_cashback_campaigns
BEFORE UPDATE ON public.cashback_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_application_cashbacks ON public.application_cashbacks;
CREATE TRIGGER set_timestamp_application_cashbacks
BEFORE UPDATE ON public.application_cashbacks
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 6: DATABASE FUNCTIONS
-- ============================================================================

-- Function to calculate total contract value for an application
CREATE OR REPLACE FUNCTION public.get_contract_value(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_weekly_price NUMERIC;
  v_weeks INTEGER;
  v_total NUMERIC;
BEGIN
  SELECT 
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
    c.weeks
  INTO v_weekly_price, v_weeks
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.studio_grade_prices sgp 
    ON c.studio_grade_id = sgp.studio_grade_id 
    AND c.academic_year_id = sgp.academic_year_id
    AND sgp.is_active = true
  WHERE sa.id = p_application_id;

  v_total := COALESCE(v_weekly_price, 0) * COALESCE(v_weeks, 0);
  RETURN v_total;
END;
$$;

-- Function to get application total with cashback applied
CREATE OR REPLACE FUNCTION public.get_application_total_with_cashback(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_due NUMERIC;
  v_cashback NUMERIC;
BEGIN
  -- Get total due from payment schedule
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  -- Get cashback amount
  SELECT COALESCE(cashback_amount, 0)
  INTO v_cashback
  FROM public.student_applications
  WHERE id = p_application_id;

  -- Return total minus cashback (minimum 0)
  RETURN GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);
END;
$$;

-- Function to calculate partner commission for an application
CREATE OR REPLACE FUNCTION public.calculate_partner_commission(p_application_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_commission NUMERIC;
BEGIN
  SELECT 
    pr.total_contract_value * (pr.commission_percentage / 100)
  INTO v_commission
  FROM public.partner_referrals pr
  WHERE pr.application_id = p_application_id;

  RETURN COALESCE(v_commission, 0);
END;
$$;

-- Function to check if student qualifies for cashback campaign
CREATE OR REPLACE FUNCTION public.check_cashback_eligibility(
  p_application_id UUID,
  p_campaign_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_application RECORD;
  v_is_eligible BOOLEAN := false;
BEGIN
  -- Get campaign details
  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  -- Check if campaign exists and is active
  IF NOT FOUND OR NOT v_campaign.is_active THEN
    RETURN false;
  END IF;

  -- Check dates
  IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
    RETURN false;
  END IF;

  -- Check max uses
  IF v_campaign.max_uses IS NOT NULL AND v_campaign.current_uses >= v_campaign.max_uses THEN
    RETURN false;
  END IF;

  -- Get application details
  SELECT * INTO v_application
  FROM public.student_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check applies_to criteria
  IF v_campaign.applies_to = 'all' THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'new' AND NOT COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'rebooking' AND COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  END IF;

  -- Check if cashback already applied to this application
  IF EXISTS (
    SELECT 1 FROM public.application_cashbacks
    WHERE application_id = p_application_id
  ) THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;

-- Function to apply cashback to application (called when application is confirmed)
CREATE OR REPLACE FUNCTION public.apply_cashback_to_application(
  p_application_id UUID,
  p_campaign_id UUID,
  p_applied_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_cashback_id UUID;
BEGIN
  -- Check eligibility
  IF NOT public.check_cashback_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this cashback campaign';
  END IF;

  -- Get campaign details
  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  -- Create application cashback record
  INSERT INTO public.application_cashbacks (
    application_id,
    campaign_id,
    cashback_amount,
    applied_by
  ) VALUES (
    p_application_id,
    p_campaign_id,
    v_campaign.cashback_amount,
    p_applied_by
  )
  RETURNING id INTO v_cashback_id;

  -- Update student_applications with cashback amount
  UPDATE public.student_applications
  SET cashback_amount = v_campaign.cashback_amount
  WHERE id = p_application_id;

  -- Increment campaign usage
  UPDATE public.cashback_campaigns
  SET current_uses = current_uses + 1
  WHERE id = p_campaign_id;

  RETURN v_cashback_id;
END;
$$;

-- Function to create partner referral record (called when application is confirmed)
CREATE OR REPLACE FUNCTION public.create_partner_referral(
  p_application_id UUID,
  p_partner_id UUID,
  p_referral_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner RECORD;
  v_contract_value NUMERIC;
  v_commission_amount NUMERIC;
  v_referral_id UUID;
BEGIN
  -- Get partner details
  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found or inactive';
  END IF;

  -- Calculate contract value
  v_contract_value := public.get_contract_value(p_application_id);

  -- Calculate commission
  v_commission_amount := v_contract_value * (v_partner.commission_percentage / 100);

  -- Create partner referral record
  INSERT INTO public.partner_referrals (
    partner_id,
    application_id,
    referral_code,
    commission_percentage,
    total_contract_value,
    commission_amount
  ) VALUES (
    p_partner_id,
    p_application_id,
    p_referral_code,
    v_partner.commission_percentage,
    v_contract_value,
    v_commission_amount
  )
  RETURNING id INTO v_referral_id;

  -- Update student_applications with partner reference
  UPDATE public.student_applications
  SET referred_by_partner_id = p_partner_id
  WHERE id = p_application_id;

  RETURN v_referral_id;
END;
$$;

-- ============================================================================
-- PART 7: GRANTS
-- ============================================================================

GRANT SELECT ON public.partners TO authenticated;
GRANT SELECT ON public.partner_referrals TO authenticated;
GRANT SELECT ON public.cashback_campaigns TO authenticated;
GRANT SELECT ON public.application_cashbacks TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_contract_value(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_application_total_with_cashback(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_partner_commission(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_cashback_eligibility(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cashback_to_application(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_referral(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- PART 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.partners IS 'Stores partner information and commission rates for referral program';
COMMENT ON TABLE public.partner_referrals IS 'Tracks which applications are referred by partners and calculates commissions';
COMMENT ON TABLE public.cashback_campaigns IS 'Stores cashback campaign definitions (e.g., £500 cashback for new students)';
COMMENT ON TABLE public.application_cashbacks IS 'Tracks which applications have cashback applied and the amount';
COMMENT ON COLUMN public.student_applications.referred_by_partner_id IS 'Partner who referred this application (if applicable)';
COMMENT ON COLUMN public.student_applications.cashback_amount IS 'Cashback amount applied to this application (denormalized for quick access)';

