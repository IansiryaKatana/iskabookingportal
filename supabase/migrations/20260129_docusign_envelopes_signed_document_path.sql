-- Add signed_document_path to docusign_envelopes for download-signed-document Edge Function
ALTER TABLE public.docusign_envelopes
  ADD COLUMN IF NOT EXISTS signed_document_path text;

COMMENT ON COLUMN public.docusign_envelopes.signed_document_path IS 'Storage path in contracts bucket for the combined signed PDF from DocuSign';
