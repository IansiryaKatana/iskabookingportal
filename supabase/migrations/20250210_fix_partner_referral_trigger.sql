-- Fix partner referral trigger to handle validated_referral_code
-- This migration fixes the issue where commissions are not created when a student
-- uses a referral code but referred_by_partner_id is not set at confirmation time

-- Drop and recreate the trigger with updated WHEN clause
DROP TRIGGER IF EXISTS trigger_auto_create_partner_referral ON public.student_applications;

CREATE TRIGGER trigger_auto_create_partner_referral
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  WHEN (
    NEW.status = 'confirmed' 
    AND (
      NEW.referred_by_partner_id IS NOT NULL 
      OR NEW.validated_referral_code IS NOT NULL
    )
  )
  EXECUTE FUNCTION public.auto_create_partner_referral_on_confirmation();

-- Backfill missing partner referral records for confirmed applications
-- that have referral codes but no partner referral record
DO $$
DECLARE
  v_application RECORD;
  v_partner_id UUID;
  v_referral_code TEXT;
  v_referral_id UUID;
BEGIN
  -- Find confirmed applications with referral codes but no partner referral record
  FOR v_application IN
    SELECT 
      sa.id AS application_id,
      sa.referred_by_partner_id,
      sa.validated_referral_code,
      sa.status
    FROM public.student_applications sa
    WHERE sa.status = 'confirmed'
      AND (
        sa.referred_by_partner_id IS NOT NULL 
        OR sa.validated_referral_code IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 
        FROM public.partner_referrals pr 
        WHERE pr.application_id = sa.id
      )
  LOOP
    -- Determine partner_id
    IF v_application.referred_by_partner_id IS NOT NULL THEN
      v_partner_id := v_application.referred_by_partner_id;
      v_referral_code := v_application.validated_referral_code;
    ELSIF v_application.validated_referral_code IS NOT NULL THEN
      -- Look up partner by referral code
      SELECT id INTO v_partner_id
      FROM public.partners
      WHERE UPPER(TRIM(referral_code)) = UPPER(TRIM(v_application.validated_referral_code))
        AND is_active = true;
      
      IF v_partner_id IS NOT NULL THEN
        v_referral_code := v_application.validated_referral_code;
        -- Update referred_by_partner_id for consistency
        UPDATE public.student_applications
        SET referred_by_partner_id = v_partner_id
        WHERE id = v_application.application_id;
      END IF;
    END IF;

    -- Create partner referral if partner found
    IF v_partner_id IS NOT NULL THEN
      BEGIN
        SELECT id INTO v_referral_id
        FROM public.partner_referrals
        WHERE application_id = v_application.application_id;
        
        IF v_referral_id IS NULL THEN
          -- Create partner referral record
          PERFORM public.create_partner_referral(
            v_application.application_id,
            v_partner_id,
            v_referral_code
          );
          
          RAISE NOTICE 'Created partner referral for application % with partner %', 
            v_application.application_id, v_partner_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create partner referral for application %: %', 
          v_application.application_id, SQLERRM;
      END;
    ELSE
      RAISE WARNING 'Could not find partner for application % with referral code %', 
        v_application.application_id, v_application.validated_referral_code;
    END IF;
  END LOOP;
END $$;

COMMENT ON TRIGGER trigger_auto_create_partner_referral ON public.student_applications IS 
  'Automatically creates partner referral record when application with referral code or partner_id is confirmed';

