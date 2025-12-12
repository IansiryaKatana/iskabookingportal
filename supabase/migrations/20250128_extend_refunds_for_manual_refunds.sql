-- Extend refunds table to support manual refunds
-- This allows recording refunds processed outside the system (e.g., bank transfers)

-- Add refund_source column to distinguish Stripe vs manual refunds
ALTER TABLE public.refunds 
ADD COLUMN IF NOT EXISTS refund_source TEXT DEFAULT 'stripe' 
CHECK (refund_source IN ('stripe', 'manual'));

-- Make stripe_refund_id optional for manual refunds
ALTER TABLE public.refunds
ALTER COLUMN stripe_refund_id DROP NOT NULL;

-- Add manual refund reference for tracking bank transfers, etc.
ALTER TABLE public.refunds
ADD COLUMN IF NOT EXISTS manual_refund_reference TEXT;

-- Add constraint: manual refunds don't need stripe_refund_id, but Stripe refunds do
-- Note: We'll use a unique constraint on stripe_refund_id only when it's not null
-- First, drop the existing unique constraint if it exists
ALTER TABLE public.refunds
DROP CONSTRAINT IF EXISTS refunds_stripe_refund_id_key;

-- Recreate unique constraint that allows NULL values
CREATE UNIQUE INDEX IF NOT EXISTS refunds_stripe_refund_id_unique 
ON public.refunds(stripe_refund_id) 
WHERE stripe_refund_id IS NOT NULL;

-- Add check constraint to ensure refunds have appropriate identifiers
-- Stripe refunds must have stripe_refund_id, manual refunds must have manual_refund_reference
ALTER TABLE public.refunds
DROP CONSTRAINT IF EXISTS check_refund_source_requirements;

-- First, set default refund_source for existing records
UPDATE public.refunds
SET refund_source = 'stripe'
WHERE refund_source IS NULL;

-- Now add the constraint
ALTER TABLE public.refunds
ADD CONSTRAINT check_refund_source_requirements 
CHECK (
  (refund_source = 'stripe' AND stripe_refund_id IS NOT NULL) OR
  (refund_source = 'manual' AND manual_refund_reference IS NOT NULL AND stripe_refund_id IS NULL)
);

-- Add index for manual refund references
CREATE INDEX IF NOT EXISTS idx_refunds_manual_reference 
ON public.refunds(manual_refund_reference) 
WHERE manual_refund_reference IS NOT NULL;

-- Add index for refund source
CREATE INDEX IF NOT EXISTS idx_refunds_refund_source 
ON public.refunds(refund_source);

-- Update comment on table
COMMENT ON TABLE public.refunds IS 'Records all refunds - both Stripe API refunds and manual refunds processed outside the system (e.g., bank transfers). Manual refunds are recorded-only and do not process through Stripe.';

