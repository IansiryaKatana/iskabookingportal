-- Staff-only update/delete for early check-in payment rows (correction workflow).

CREATE OR REPLACE FUNCTION public.admin_update_early_check_in_payment(
  p_payment_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_reference_number TEXT,
  p_payment_method TEXT DEFAULT 'bank_transfer',
  p_payment_type TEXT DEFAULT 'payment',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_payment public.early_check_in_payments%ROWTYPE;
  v_eci public.early_check_ins%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can update early check-in payments';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Payment date is required';
  END IF;

  IF NULLIF(TRIM(p_reference_number), '') IS NULL THEN
    RAISE EXCEPTION 'Reference number is required';
  END IF;

  IF p_payment_method NOT IN ('bank_transfer', 'cash', 'card', 'stripe', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_payment_type NOT IN ('payment', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid payment type';
  END IF;

  SELECT * INTO v_payment
  FROM public.early_check_in_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Early check-in payment not found';
  END IF;

  SELECT * INTO v_eci
  FROM public.early_check_ins
  WHERE id = v_payment.early_check_in_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No early check-in found for this payment';
  END IF;

  IF v_eci.status = 'cancelled' AND p_payment_type = 'payment' THEN
    RAISE EXCEPTION 'Cannot set payment type on a cancelled early check-in (refunds/adjustments allowed)';
  END IF;

  UPDATE public.early_check_in_payments
  SET
    amount = ROUND(p_amount, 2),
    payment_type = p_payment_type,
    payment_method = p_payment_method,
    reference_number = TRIM(p_reference_number),
    payment_date = p_payment_date,
    notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_payment_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
  VALUES (
    'student_application',
    v_payment.application_id,
    'early_check_in_payment_updated',
    'Updated early check-in ' || p_payment_type || ' to ' || ROUND(p_amount, 2)::TEXT
      || ' (' || p_payment_method || ', ref ' || TRIM(p_reference_number) || ')',
    v_user_id
  );

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'early_check_in_id', v_payment.early_check_in_id,
    'application_id', v_payment.application_id,
    'amount', ROUND(p_amount, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_early_check_in_payment(
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_payment public.early_check_in_payments%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can delete early check-in payments';
  END IF;

  SELECT * INTO v_payment
  FROM public.early_check_in_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Early check-in payment not found';
  END IF;

  DELETE FROM public.early_check_in_payments
  WHERE id = p_payment_id;

  INSERT INTO public.activity_log (entity_type, entity_id, action, message, created_by)
  VALUES (
    'student_application',
    v_payment.application_id,
    'early_check_in_payment_deleted',
    'Deleted early check-in ' || v_payment.payment_type || ' of '
      || ROUND(v_payment.amount, 2)::TEXT
      || ' (ref ' || COALESCE(v_payment.reference_number, '') || ')',
    v_user_id
  );

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'early_check_in_id', v_payment.early_check_in_id,
    'application_id', v_payment.application_id,
    'deleted', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_early_check_in_payment(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_early_check_in_payment(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_update_early_check_in_payment(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) IS
  'Staff-only: update an early check-in payment/refund/adjustment row.';
COMMENT ON FUNCTION public.admin_delete_early_check_in_payment(UUID) IS
  'Staff-only: delete an early check-in payment row and log the correction.';
