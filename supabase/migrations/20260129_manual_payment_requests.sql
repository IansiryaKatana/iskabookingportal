-- Student-submitted manual payment requests (bank transfer, etc.) for accountant approval.
-- On approve: create manual_payment and mark request approved. Student portal then shows instalment as Paid.

CREATE TABLE IF NOT EXISTS public.manual_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  instalment_id UUID NOT NULL REFERENCES public.contract_payment_schedule(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'cheque')),
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_application
  ON public.manual_payment_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_instalment
  ON public.manual_payment_requests(instalment_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_status
  ON public.manual_payment_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_submitted_at
  ON public.manual_payment_requests(submitted_at DESC);

DROP TRIGGER IF EXISTS set_timestamp_manual_payment_requests ON public.manual_payment_requests;
CREATE TRIGGER set_timestamp_manual_payment_requests
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;

-- Students can insert their own requests (for their application only) and select their own
CREATE POLICY "Students insert own manual payment requests"
  ON public.manual_payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = application_id AND sa.student_id = auth.uid()
    )
  );

CREATE POLICY "Students view own manual payment requests"
  ON public.manual_payment_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.id = application_id AND sa.student_id = auth.uid()
    )
  );

-- Staff can view all and update (approve/reject)
CREATE POLICY "Staff manage manual payment requests"
  ON public.manual_payment_requests
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

GRANT SELECT, INSERT ON public.manual_payment_requests TO authenticated;
GRANT UPDATE ON public.manual_payment_requests TO authenticated;

COMMENT ON TABLE public.manual_payment_requests IS 'Student-submitted requests to record a manual payment (e.g. bank transfer). Staff approve to create manual_payment; reject to decline.';
