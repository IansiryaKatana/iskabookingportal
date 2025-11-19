-- Add stripe_customer_id column to stripe_payments table
-- This column was missing but may be needed for future features

ALTER TABLE public.stripe_payments
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Create index for stripe_customer_id lookups
CREATE INDEX IF NOT EXISTS idx_stripe_payments_customer_id 
ON public.stripe_payments(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- Update existing records if stripe_customer_id exists in student_applications
-- (This assumes the column was removed from student_applications in the stripe_payments migration)
UPDATE public.stripe_payments sp
SET stripe_customer_id = sa.stripe_customer_id
FROM public.student_applications sa
WHERE sp.student_application_id = sa.id
  AND sa.stripe_customer_id IS NOT NULL
  AND sp.stripe_customer_id IS NULL;

COMMENT ON COLUMN public.stripe_payments.stripe_customer_id IS 'Stripe Customer ID - links payment to Stripe customer record';

