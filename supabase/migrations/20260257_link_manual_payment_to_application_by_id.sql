-- RPC to link an existing unlinked (orphaned) manual payment to an application by payment id.
-- Used by staff on Manual Payment Entry to assign a payment to an application (and optionally an instalment).
-- For deposit: updates application deposit_payment_intent_id and step 5 payload; for instalment: sets instalment_id.

CREATE OR REPLACE FUNCTION public.link_manual_payment_to_application_by_id(
  p_payment_id UUID,
  p_application_id UUID,
  p_instalment_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_step5 RECORD;
BEGIN
  SELECT id, payment_type, application_id
  INTO v_payment
  FROM public.manual_payments
  WHERE id = p_payment_id
    AND application_id IS NULL
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already linked';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_payment.payment_type = 'deposit' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_applications
      WHERE id = p_application_id
        AND deposit_payment_intent_id IS NOT NULL
        AND deposit_payment_intent_id <> ''
    ) THEN
      RAISE EXCEPTION 'This application already has a deposit recorded';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.manual_payments
      WHERE application_id = p_application_id
        AND payment_type = 'deposit'
        AND id <> p_payment_id
    ) THEN
      RAISE EXCEPTION 'This application already has a deposit recorded';
    END IF;

    UPDATE public.manual_payments
    SET application_id = p_application_id,
        instalment_id = NULL,
        updated_at = NOW()
    WHERE id = p_payment_id;

    UPDATE public.student_applications
    SET deposit_payment_intent_id = 'manual-' || p_payment_id,
        updated_at = NOW()
    WHERE id = p_application_id;

    SELECT id, payload INTO v_step5
    FROM public.student_application_steps
    WHERE application_id = p_application_id AND step_number = 5
    LIMIT 1;

    IF v_step5.id IS NOT NULL THEN
      UPDATE public.student_application_steps
      SET payload = jsonb_set(
        COALESCE(payload, '{}'::jsonb),
        '{deposit_paid}',
        'true'::jsonb
      ),
      updated_at = NOW()
      WHERE id = v_step5.id;
    END IF;

    UPDATE public.student_applications
    SET status = 'awaiting_signature',
        updated_at = NOW()
    WHERE id = p_application_id
      AND status = 'awaiting_deposit';

  ELSIF v_payment.payment_type = 'instalment' THEN
    IF p_instalment_id IS NULL THEN
      RAISE EXCEPTION 'Instalment is required when linking an instalment payment';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.contract_payment_schedule
      WHERE id = p_instalment_id
    ) THEN
      RAISE EXCEPTION 'Instalment not found';
    END IF;

    UPDATE public.manual_payments
    SET application_id = p_application_id,
        instalment_id = p_instalment_id,
        updated_at = NOW()
    WHERE id = p_payment_id;

  ELSE
    RAISE EXCEPTION 'Invalid payment type';
  END IF;

  RETURN p_payment_id;
END;
$$;

COMMENT ON FUNCTION public.link_manual_payment_to_application_by_id(UUID, UUID, UUID) IS
  'Link an unlinked manual payment (by id) to an application. For deposit: updates application deposit status; for instalment: p_instalment_id required.';

GRANT EXECUTE ON FUNCTION public.link_manual_payment_to_application_by_id(UUID, UUID, UUID) TO authenticated;
