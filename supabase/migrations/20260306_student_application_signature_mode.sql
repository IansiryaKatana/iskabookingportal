-- Signature mode for applications: DocuSign vs manual upload
-- This controls how agreements are managed for a given application.

ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS signature_mode text
    CHECK (signature_mode IN ('docusign', 'manual_upload'))
    DEFAULT 'docusign';

COMMENT ON COLUMN public.student_applications.signature_mode IS
  'How agreements are managed for this application: docusign (DocuSign envelopes) or manual_upload (staff upload signed PDFs).';

-- Backfill likely manual-upload applications:
-- any application that already has an envelope marked as uploaded_by_staff
UPDATE public.student_applications a
SET signature_mode = 'manual_upload'
WHERE EXISTS (
  SELECT 1
  FROM public.docusign_envelopes e
  WHERE e.application_id = a.id
    AND (e.metadata ->> 'uploaded_by_staff')::boolean IS TRUE
)
  AND (signature_mode IS NULL OR signature_mode = 'docusign');

