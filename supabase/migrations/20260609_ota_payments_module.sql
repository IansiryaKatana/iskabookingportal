-- OTA Payments module: track cash received per reservation (partial/full settlement)

BEGIN;

-- ============================================================================
-- 1. OTA PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ota_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_booking_id UUID NOT NULL REFERENCES public.ota_bookings(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL DEFAULT 'payout'
    CHECK (payment_type IN ('payout', 'refund', 'adjustment')),
  received_from TEXT NOT NULL DEFAULT 'ota_payout'
    CHECK (received_from IN ('ota_payout', 'bank_transfer', 'virtual_card', 'guest_direct', 'other')),
  reference_number TEXT NOT NULL,
  payment_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ota_payments_booking_id ON public.ota_payments(ota_booking_id);
CREATE INDEX IF NOT EXISTS idx_ota_payments_payment_date ON public.ota_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_ota_payments_recorded_by ON public.ota_payments(recorded_by);

CREATE OR REPLACE FUNCTION public.update_ota_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ota_payments_updated_at ON public.ota_payments;
CREATE TRIGGER ota_payments_updated_at
  BEFORE UPDATE ON public.ota_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ota_payments_updated_at();

-- ============================================================================
-- 2. PAYMENT SUMMARY FUNCTION (mirrors get_payment_summary for students)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ota_amount_due(p_booking_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC := 0;
  v_commission NUMERIC := 0;
  v_expected_payout NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(ob.price_per_night, 0) * COALESCE(ob.number_of_nights, 0),
    COALESCE(ob.commission_amount, 0),
    ob.total_revenue
  INTO v_gross, v_commission, v_expected_payout
  FROM public.ota_bookings ob
  WHERE ob.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_expected_payout IS NOT NULL THEN
    RETURN GREATEST(0, v_expected_payout);
  END IF;

  RETURN GREATEST(0, v_gross - v_commission);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ota_payment_summary(p_booking_id UUID)
RETURNS TABLE (
  gross_booking_value NUMERIC,
  amount_due NUMERIC,
  total_received NUMERIC,
  remaining_balance NUMERIC,
  payment_count INTEGER,
  last_payment_date DATE,
  payment_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC := 0;
  v_amount_due NUMERIC := 0;
  v_total_received NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date DATE;
  v_remaining NUMERIC := 0;
  v_tolerance NUMERIC := 0.01;
  v_status TEXT := 'unpaid';
  v_booking_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ota_bookings WHERE id = p_booking_id) THEN
    RETURN QUERY SELECT
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::INTEGER, NULL::DATE, 'unpaid'::TEXT;
    RETURN;
  END IF;

  SELECT
    COALESCE(ob.price_per_night, 0) * COALESCE(ob.number_of_nights, 0),
    ob.status
  INTO v_gross, v_booking_status
  FROM public.ota_bookings ob
  WHERE ob.id = p_booking_id;

  v_amount_due := public.get_ota_amount_due(p_booking_id);

  SELECT
    COALESCE(SUM(
      CASE
        WHEN op.payment_type = 'refund' THEN -op.amount
        ELSE op.amount
      END
    ), 0),
    COUNT(*)::INTEGER,
    MAX(op.payment_date)
  INTO v_total_received, v_payment_count, v_last_payment_date
  FROM public.ota_payments op
  WHERE op.ota_booking_id = p_booking_id;

  v_remaining := GREATEST(0, v_amount_due - v_total_received);

  IF v_booking_status IN ('cancelled', 'no_show') THEN
    v_status := 'void';
  ELSIF v_amount_due <= 0 THEN
    v_status := 'no_amount_due';
  ELSIF v_total_received <= v_tolerance THEN
    v_status := 'unpaid';
  ELSIF v_total_received + v_tolerance < v_amount_due THEN
    v_status := 'partially_paid';
  ELSIF v_total_received <= v_amount_due + v_tolerance THEN
    v_status := 'fully_paid';
  ELSE
    v_status := 'overpaid';
  END IF;

  RETURN QUERY SELECT
    v_gross,
    v_amount_due,
    v_total_received,
    v_remaining,
    v_payment_count,
    v_last_payment_date,
    v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ota_amount_due(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ota_payment_summary(UUID) TO authenticated;

-- ============================================================================
-- 3. LEDGER VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.ota_bookings_payment_ledger AS
SELECT
  ob.id AS booking_id,
  ob.external_ref,
  ob.channel,
  ob.guest_name,
  ob.studio_id,
  ob.check_in,
  ob.check_out,
  ob.status AS booking_status,
  ob.price_per_night,
  ob.commission_amount,
  ob.total_revenue,
  ob.number_of_nights,
  ob.currency,
  ps.gross_booking_value,
  ps.amount_due,
  ps.total_received,
  ps.remaining_balance,
  ps.payment_count,
  ps.last_payment_date,
  ps.payment_status
FROM public.ota_bookings ob
CROSS JOIN LATERAL public.get_ota_payment_summary(ob.id) ps;

GRANT SELECT ON public.ota_bookings_payment_ledger TO authenticated;

-- ============================================================================
-- 4. RLS
-- ============================================================================

ALTER TABLE public.ota_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage OTA payments" ON public.ota_payments;
CREATE POLICY "Staff manage OTA payments" ON public.ota_payments
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_payments TO authenticated;

-- ============================================================================
-- 5. ROUTE PERMISSIONS
-- ============================================================================

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/ota-bookings/payments', 'OTA Payments', 'staff', true),
  ('/ota-bookings/payments', 'OTA Payments', 'superadmin', true),
  ('/ota-bookings/payments', 'OTA Payments', 'admin', true),
  ('/ota-bookings/payments', 'OTA Payments', 'operations_manager', true),
  ('/ota-bookings/payments', 'OTA Payments', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMENT ON TABLE public.ota_payments IS 'Cash received for OTA reservations; supports partial and follow-up payments';
COMMENT ON COLUMN public.ota_payments.amount IS 'Always positive; refunds use payment_type=refund';
COMMENT ON COLUMN public.ota_bookings.total_revenue IS 'Expected net payout (gross minus commission), not cash received';

COMMIT;
