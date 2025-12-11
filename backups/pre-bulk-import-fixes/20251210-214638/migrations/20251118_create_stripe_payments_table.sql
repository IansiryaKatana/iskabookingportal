-- Create Stripe Payments Table
-- Tracks individual Stripe payment transactions

CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  payment_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'completed')),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'instalment')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_payments_application ON public.stripe_payments(student_application_id);
CREATE INDEX idx_stripe_payments_intent ON public.stripe_payments(stripe_payment_intent_id);
CREATE INDEX idx_stripe_payments_status ON public.stripe_payments(status);
CREATE INDEX idx_stripe_payments_created ON public.stripe_payments(created_at DESC);

DROP TRIGGER IF EXISTS set_timestamp_stripe_payments ON public.stripe_payments;
CREATE TRIGGER set_timestamp_stripe_payments
BEFORE UPDATE ON public.stripe_payments
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- RLS Policies
ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;

-- Staff can view all Stripe payments
CREATE POLICY "Staff view all Stripe payments" ON public.stripe_payments
  FOR SELECT USING (public.is_staff());

-- Staff can insert Stripe payments
CREATE POLICY "Staff insert Stripe payments" ON public.stripe_payments
  FOR INSERT WITH CHECK (public.is_staff());

-- Staff can update Stripe payments
CREATE POLICY "Staff update Stripe payments" ON public.stripe_payments
  FOR UPDATE USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Students can view their own Stripe payments
CREATE POLICY "Students view own Stripe payments" ON public.stripe_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications a
      WHERE a.id = student_application_id
        AND a.student_id = auth.uid()
    )
  );

-- Migrate existing deposit payment intents from student_applications
-- This will populate the table with existing deposit payments
INSERT INTO public.stripe_payments (
  student_application_id,
  stripe_payment_intent_id,
  amount,
  currency,
  status,
  payment_type,
  created_at
)
SELECT 
  id AS student_application_id,
  deposit_payment_intent_id AS stripe_payment_intent_id,
  -- Try to get amount from contract payment schedule or use a default
  COALESCE(
    (SELECT deposit_override FROM public.contracts WHERE id = contract_id),
    (SELECT deposit_amount FROM public.payment_plans pp 
     INNER JOIN public.contracts c ON c.payment_plan_id = pp.id 
     WHERE c.id = contract_id),
    0
  ) AS amount,
  'GBP' AS currency,
  CASE 
    WHEN status IN ('awaiting_signature', 'awaiting_verification', 'confirmed') THEN 'succeeded'
    WHEN status = 'awaiting_deposit' THEN 'pending'
    ELSE 'pending'
  END AS status,
  'deposit' AS payment_type,
  COALESCE(submitted_at, created_at) AS created_at
FROM public.student_applications
WHERE deposit_payment_intent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stripe_payments 
    WHERE stripe_payment_intent_id = student_applications.deposit_payment_intent_id
  );

COMMENT ON TABLE public.stripe_payments IS 'Tracks individual Stripe payment transactions (deposits and installments)';
COMMENT ON COLUMN public.stripe_payments.stripe_payment_intent_id IS 'Stripe Payment Intent ID - unique identifier from Stripe';
COMMENT ON COLUMN public.stripe_payments.payment_type IS 'Type of payment: deposit or instalment';

