-- Add invoice_number columns to payment tables
-- Invoice numbers will be generated when invoices are created

-- Add invoice_number to stripe_payments
ALTER TABLE public.stripe_payments
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Add invoice_number to manual_payments
ALTER TABLE public.manual_payments
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Add index for invoice number lookups
CREATE INDEX IF NOT EXISTS idx_stripe_payments_invoice_number 
ON public.stripe_payments(invoice_number) 
WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_payments_invoice_number 
ON public.manual_payments(invoice_number) 
WHERE invoice_number IS NOT NULL;

-- Add invoice_generated_at timestamp for tracking
ALTER TABLE public.stripe_payments
ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMPTZ;

ALTER TABLE public.manual_payments
ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.stripe_payments.invoice_number IS 'Sequential invoice number (e.g., INV-STUDENT-2025-001)';
COMMENT ON COLUMN public.manual_payments.invoice_number IS 'Sequential invoice number (e.g., INV-STUDENT-2025-001)';
COMMENT ON COLUMN public.stripe_payments.invoice_generated_at IS 'Timestamp when invoice PDF was generated';
COMMENT ON COLUMN public.manual_payments.invoice_generated_at IS 'Timestamp when invoice PDF was generated';

