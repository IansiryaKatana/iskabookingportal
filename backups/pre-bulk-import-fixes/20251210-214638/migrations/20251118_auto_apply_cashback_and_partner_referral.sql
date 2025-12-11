-- Auto-apply cashback and create partner referral on application confirmation
-- This migration creates triggers to automatically:
-- 1. Apply eligible cashback campaigns when application is confirmed
-- 2. Create partner referral record when application with referred_by_partner_id is confirmed

-- Function to auto-apply cashback on confirmation
CREATE OR REPLACE FUNCTION public.auto_apply_cashback_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_applies_to TEXT;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Check if cashback already applied
    IF EXISTS (SELECT 1 FROM public.application_cashbacks WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Determine applies_to based on is_rebooking
    v_applies_to := CASE 
      WHEN COALESCE(NEW.is_rebooking, false) THEN 'rebooking'
      ELSE 'new'
    END;

    -- Find eligible active campaign
    SELECT * INTO v_campaign
    FROM public.cashback_campaigns
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
      AND (applies_to = 'all' OR applies_to = v_applies_to)
      AND (max_uses IS NULL OR current_uses < max_uses)
    ORDER BY created_at DESC
    LIMIT 1;

    -- Apply cashback if eligible campaign found
    IF FOUND THEN
      PERFORM public.apply_cashback_to_application(
        NEW.id,
        v_campaign.id,
        NULL -- System applied
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to auto-create partner referral on confirmation
CREATE OR REPLACE FUNCTION public.auto_create_partner_referral_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_code TEXT;
  v_partner_id UUID;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' 
     AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    
    -- Check if referral already exists
    IF EXISTS (SELECT 1 FROM public.partner_referrals WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Determine partner_id: use referred_by_partner_id if set, otherwise validate referral code
    IF NEW.referred_by_partner_id IS NOT NULL THEN
      v_partner_id := NEW.referred_by_partner_id;
      v_referral_code := NEW.validated_referral_code;
    ELSIF NEW.validated_referral_code IS NOT NULL THEN
      -- Look up partner by referral code
      SELECT id INTO v_partner_id
      FROM public.partners
      WHERE UPPER(TRIM(referral_code)) = UPPER(TRIM(NEW.validated_referral_code))
        AND is_active = true;
      
      IF v_partner_id IS NOT NULL THEN
        v_referral_code := NEW.validated_referral_code;
        -- Update referred_by_partner_id for consistency
        UPDATE public.student_applications
        SET referred_by_partner_id = v_partner_id
        WHERE id = NEW.id;
      END IF;
    END IF;

    -- Create partner referral if partner found
    IF v_partner_id IS NOT NULL THEN
      PERFORM public.create_partner_referral(
        NEW.id,
        v_partner_id,
        v_referral_code
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_auto_apply_cashback ON public.student_applications;
CREATE TRIGGER trigger_auto_apply_cashback
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION public.auto_apply_cashback_on_confirmation();

DROP TRIGGER IF EXISTS trigger_auto_create_partner_referral ON public.student_applications;
CREATE TRIGGER trigger_auto_create_partner_referral
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND NEW.referred_by_partner_id IS NOT NULL)
  EXECUTE FUNCTION public.auto_create_partner_referral_on_confirmation();

-- Comments
COMMENT ON FUNCTION public.auto_apply_cashback_on_confirmation() IS 'Automatically applies eligible cashback campaigns when application is confirmed';
COMMENT ON FUNCTION public.auto_create_partner_referral_on_confirmation() IS 'Automatically creates partner referral record when application with referred_by_partner_id is confirmed';

