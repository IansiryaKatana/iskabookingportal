-- Fix auto-apply discount so ineligible applications don't block status changes.
-- Also, no change to existing manual payment behaviour in DB; deletion is handled via existing
-- "Staff manage manual payments" RLS policy and frontend safeguards.

-- 1) Make auto_apply_discount_on_confirmation respect booking_source filter and
--    swallow eligibility errors so status updates are never blocked.

CREATE OR REPLACE FUNCTION public.auto_apply_discount_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_applies_to TEXT;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- If discount already applied, do nothing
    IF EXISTS (SELECT 1 FROM public.application_discounts WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Determine applies_to bucket
    v_applies_to := CASE
      WHEN COALESCE(NEW.is_rebooking, false) THEN 'rebooking'
      ELSE 'new'
    END;

    -- Select the most recent eligible campaign, including optional booking_source filter
    SELECT * INTO v_campaign
    FROM public.discount_campaigns
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
      AND (applies_to = 'all' OR applies_to = v_applies_to)
      AND (booking_source IS NULL OR booking_source = NEW.booking_source)
      AND (max_uses IS NULL OR current_uses < max_uses)
    ORDER BY created_at DESC
    LIMIT 1;

    -- If we found a campaign, try to apply it. If eligibility fails or any other
    -- error is raised, swallow it so the core status update still succeeds.
    IF FOUND THEN
      BEGIN
        PERFORM public.apply_discount_to_application(NEW.id, v_campaign.id, NULL);
      EXCEPTION WHEN OTHERS THEN
        -- Intentionally ignore discount errors here; discount is optional and
        -- should never prevent confirming / updating an application.
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent) to ensure it points at the latest function definition.
DROP TRIGGER IF EXISTS trigger_auto_apply_discount ON public.student_applications;
CREATE TRIGGER trigger_auto_apply_discount
  AFTER UPDATE OF status ON public.student_applications
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION public.auto_apply_discount_on_confirmation();

