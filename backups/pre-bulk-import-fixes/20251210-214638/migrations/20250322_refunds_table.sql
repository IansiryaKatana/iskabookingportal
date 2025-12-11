-- Refunds Table
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.student_applications(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_intent_id TEXT NOT NULL,
  stripe_refund_id TEXT NOT NULL UNIQUE,
  amount_pence INTEGER NOT NULL,
  amount_gbp NUMERIC(10, 2) GENERATED ALWAYS AS (amount_pence / 100.0) STORED,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  refunded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_application ON public.refunds(application_id);
CREATE INDEX idx_refunds_student ON public.refunds(student_id);
CREATE INDEX idx_refunds_payment_intent ON public.refunds(payment_intent_id);
CREATE INDEX idx_refunds_stripe_refund_id ON public.refunds(stripe_refund_id);
CREATE INDEX idx_refunds_status ON public.refunds(status);
CREATE INDEX idx_refunds_processed_at ON public.refunds(processed_at DESC);

DROP TRIGGER IF EXISTS set_timestamp_refunds ON public.refunds;
CREATE TRIGGER set_timestamp_refunds
BEFORE UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- RLS Policies for Refunds
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Staff view all refunds" ON public.refunds;
DROP POLICY IF EXISTS "Staff create refunds" ON public.refunds;
DROP POLICY IF EXISTS "Students view own refunds" ON public.refunds;

-- Staff can view all refunds
CREATE POLICY "Staff view all refunds" ON public.refunds
  FOR SELECT USING (public.is_staff());

-- Staff can create refunds
CREATE POLICY "Staff create refunds" ON public.refunds
  FOR INSERT WITH CHECK (public.is_staff());

-- Students can view their own refunds
CREATE POLICY "Students view own refunds" ON public.refunds
  FOR SELECT USING (auth.uid() = student_id);

