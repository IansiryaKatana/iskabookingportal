-- Manual Payments Table

CREATE TABLE IF NOT EXISTS public.manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'instalment')),
  instalment_id UUID REFERENCES public.contract_payment_schedule(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'cheque')),
  receipt_number TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_manual_payments_application ON public.manual_payments(application_id);
CREATE INDEX idx_manual_payments_instalment ON public.manual_payments(instalment_id);
CREATE INDEX idx_manual_payments_date ON public.manual_payments(payment_date);

DROP TRIGGER IF EXISTS set_timestamp_manual_payments ON public.manual_payments;
CREATE TRIGGER set_timestamp_manual_payments
BEFORE UPDATE ON public.manual_payments
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- RLS Policies
ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

-- Staff can manage manual payments
CREATE POLICY "Staff manage manual payments" ON public.manual_payments
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Students can view their own manual payments
CREATE POLICY "Students view own manual payments" ON public.manual_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_applications a
      WHERE a.id = application_id
        AND a.student_id = auth.uid()
    )
  );

