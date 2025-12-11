-- Utility Payments (Expenses) System
-- Tracks utility expenses per academic year for financial reporting

-- ============================================================================
-- PART 1: UTILITY PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.utility_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  expense_category TEXT NOT NULL CHECK (expense_category IN (
    'electricity', 'water', 'gas', 'internet', 'maintenance', 
    'cleaning', 'insurance', 'property_tax', 'other'
  )),
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  vendor_name TEXT,
  invoice_number TEXT,
  receipt_path TEXT, -- Storage path for receipt/document
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utility_payments_academic_year_id ON public.utility_payments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_utility_payments_category ON public.utility_payments(expense_category);
CREATE INDEX IF NOT EXISTS idx_utility_payments_payment_date ON public.utility_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_utility_payments_created_at ON public.utility_payments(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_utility_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS utility_payments_updated_at ON public.utility_payments;
CREATE TRIGGER utility_payments_updated_at
  BEFORE UPDATE ON public.utility_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_utility_payments_updated_at();

-- ============================================================================
-- PART 2: RLS POLICIES
-- ============================================================================

ALTER TABLE public.utility_payments ENABLE ROW LEVEL SECURITY;

-- Staff can manage all utility payments
CREATE POLICY "Staff manage utility payments" ON public.utility_payments
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 3: GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utility_payments TO authenticated;

-- ============================================================================
-- PART 4: EXPENSE SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.expense_summary_by_academic_year AS
SELECT 
  academic_year_id,
  ay.name AS academic_year_name,
  expense_category,
  COUNT(*) AS expense_count,
  SUM(amount) AS total_amount,
  MIN(payment_date) AS first_payment_date,
  MAX(payment_date) AS last_payment_date
FROM public.utility_payments up
INNER JOIN public.academic_years ay ON ay.id = up.academic_year_id
GROUP BY academic_year_id, ay.name, expense_category
ORDER BY academic_year_id, expense_category;

GRANT SELECT ON public.expense_summary_by_academic_year TO authenticated;

-- ============================================================================
-- PART 5: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.utility_payments IS 'Utility and expense payments tracked per academic year';
COMMENT ON COLUMN public.utility_payments.expense_category IS 'Category of expense: electricity, water, gas, internet, maintenance, cleaning, insurance, property_tax, other';
COMMENT ON COLUMN public.utility_payments.receipt_path IS 'Storage path for receipt/invoice document';
COMMENT ON VIEW public.expense_summary_by_academic_year IS 'Summary of expenses by academic year and category';

-- ============================================================================
-- PART 6: STORAGE BUCKET SETUP
-- ============================================================================

-- Storage bucket: expense-receipts
-- Path: expense-receipts/{academic_year_id}/{category}/{uuid}.{ext}
-- 
-- IMPORTANT: Storage policies cannot be created via migrations.
-- Please follow the instructions in docs/STORAGE_BUCKET_SETUP_INSTRUCTIONS.md
-- 
-- Quick setup:
-- 1. Create bucket "expense-receipts" as PRIVATE in Supabase Dashboard > Storage
-- 2. Run the SQL policies from docs/STORAGE_BUCKET_SETUP_INSTRUCTIONS.md in SQL Editor

