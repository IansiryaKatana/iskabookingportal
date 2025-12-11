-- Manual Payment Entry System
-- Allows payments to be recorded before applications exist
-- Students can verify payments using receipt/cheque numbers in Step 5

-- Step 1: Make application_id nullable to allow orphaned payments
ALTER TABLE public.manual_payments
  ALTER COLUMN application_id DROP NOT NULL;

-- Step 2: Update foreign key constraint to allow NULL
-- (PostgreSQL allows NULL in foreign keys by default, but we need to handle CASCADE)
-- We'll keep the foreign key but allow NULL values
ALTER TABLE public.manual_payments
  DROP CONSTRAINT IF EXISTS manual_payments_application_id_fkey;

ALTER TABLE public.manual_payments
  ADD CONSTRAINT manual_payments_application_id_fkey
  FOREIGN KEY (application_id)
  REFERENCES public.student_applications(id)
  ON DELETE CASCADE;

-- Step 3: Add unique index on receipt_number (where not null)
-- This ensures receipt numbers are unique and enables fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payments_receipt_number_unique
  ON public.manual_payments(receipt_number)
  WHERE receipt_number IS NOT NULL;

-- Step 4: Add index for orphaned payments (no application_id yet)
-- This helps with queries to find unlinked payments
CREATE INDEX IF NOT EXISTS idx_manual_payments_orphaned
  ON public.manual_payments(receipt_number, payment_date, payment_type)
  WHERE application_id IS NULL;

-- Step 5: Update RLS policy to allow staff to view orphaned payments
-- The existing "Staff manage manual payments" policy already covers this
-- But we need to ensure students can't see orphaned payments (they're not linked to their apps)
-- The existing student policy already handles this correctly (requires application_id to exist)

-- Step 6: Add comment explaining the new functionality
COMMENT ON COLUMN public.manual_payments.application_id IS 
  'Application this payment is linked to. NULL means payment was recorded before application was created. Payment can be linked later when student verifies receipt number.';

COMMENT ON COLUMN public.manual_payments.receipt_number IS 
  'Unique receipt or cheque number. Used by students to verify and link payments in Step 5. Must be unique across all payments.';

-- Step 7: Create RPC function to verify payment by receipt number
-- This will be used by the payment verification hook
CREATE OR REPLACE FUNCTION public.verify_payment_by_receipt(
  p_receipt_number TEXT
)
RETURNS TABLE (
  id UUID,
  payment_type TEXT,
  amount NUMERIC,
  payment_method TEXT,
  payment_date DATE,
  is_linked BOOLEAN,
  application_id UUID,
  recorded_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.payment_type,
    mp.amount,
    mp.payment_method,
    mp.payment_date,
    (mp.application_id IS NOT NULL) AS is_linked,
    mp.application_id,
    mp.recorded_by,
    mp.notes,
    mp.created_at
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
  ORDER BY mp.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_payment_by_receipt(TEXT) TO authenticated;

COMMENT ON FUNCTION public.verify_payment_by_receipt IS 
  'Verify a payment by receipt number. Returns payment details if found, including whether it is already linked to an application.';

-- Step 8: Create RPC function to link payment to application
-- This will be called when student verifies payment in Step 5
CREATE OR REPLACE FUNCTION public.link_payment_to_application(
  p_receipt_number TEXT,
  p_application_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_type TEXT;
  v_amount NUMERIC;
BEGIN
  -- Find the payment by receipt number
  SELECT mp.id, mp.payment_type, mp.amount
  INTO v_payment_id, v_payment_type, v_amount
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
    AND mp.application_id IS NULL  -- Only link unlinked payments
  LIMIT 1;

  -- If payment not found or already linked, return error
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already linked';
  END IF;

  -- Verify application exists
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Link the payment to the application
  UPDATE public.manual_payments
  SET application_id = p_application_id,
      updated_at = NOW()
  WHERE id = v_payment_id;

  -- Return the payment ID
  RETURN v_payment_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.link_payment_to_application(TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.link_payment_to_application IS 
  'Link an unlinked payment (identified by receipt number) to an application. Only works if payment is not already linked.';

