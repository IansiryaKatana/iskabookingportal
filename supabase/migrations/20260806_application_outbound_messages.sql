-- Application outbound message history (emails sent from Application Detail Quick Actions)

CREATE TABLE IF NOT EXISTS public.application_outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.student_applications(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_type text NOT NULL
    CHECK (message_type IN (
      'deposit_reminder',
      'signature_reminder',
      'application_confirmed',
      'installment_invoice'
    )),
  channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email')),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed')),
  provider_message_id text,
  attachment_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_outbound_messages_app_created
  ON public.application_outbound_messages (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_outbound_messages_type
  ON public.application_outbound_messages (message_type);

COMMENT ON TABLE public.application_outbound_messages IS
  'Immutable history of emails sent from application Quick Actions (reminders, confirmation, installment invoices).';

ALTER TABLE public.application_outbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff select application outbound messages"
  ON public.application_outbound_messages;
CREATE POLICY "Staff select application outbound messages"
  ON public.application_outbound_messages
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff insert application outbound messages"
  ON public.application_outbound_messages;
CREATE POLICY "Staff insert application outbound messages"
  ON public.application_outbound_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

-- Private bucket for installment invoice PDF snapshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-invoices',
  'application-invoices',
  false,
  10485760,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Staff read application invoices" ON storage.objects;
CREATE POLICY "Staff read application invoices"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'application-invoices' AND public.is_staff());

DROP POLICY IF EXISTS "Staff upload application invoices" ON storage.objects;
CREATE POLICY "Staff upload application invoices"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'application-invoices' AND public.is_staff());

DROP POLICY IF EXISTS "Staff update application invoices" ON storage.objects;
CREATE POLICY "Staff update application invoices"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'application-invoices' AND public.is_staff())
  WITH CHECK (bucket_id = 'application-invoices' AND public.is_staff());
