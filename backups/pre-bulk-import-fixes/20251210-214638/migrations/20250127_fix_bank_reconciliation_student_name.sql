-- Fix bank_reconciliation_report view to properly join student names
-- The issue was using uph.student_id instead of sa.student_id for the profiles join

CREATE OR REPLACE VIEW public.bank_reconciliation_report AS
SELECT 
  uph.payment_id,
  uph.payment_source,
  uph.student_application_id,
  COALESCE(uph.student_id, sa.student_id) AS student_id,
  COALESCE(
    p.first_name || ' ' || p.last_name,
    'Unknown Student'
  ) AS student_name,
  uph.amount_paid,
  uph.currency,
  uph.payment_status,
  uph.payment_date,
  -- Stripe specific fields
  uph.stripe_payment_intent_id,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 'Stripe'
    ELSE 'Manual Entry'
  END AS payment_method,
  -- Manual payment specific fields
  uph.manual_entry_notes,
  uph.entered_by_user_id,
  CASE 
    WHEN uph.payment_source = 'manual' THEN 
      (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = uph.entered_by_user_id)
    ELSE NULL
  END AS entered_by_name,
  -- Payment type (check metadata first, then use installment_number as fallback)
  CASE 
    WHEN COALESCE(uph.payment_metadata->>'type', '') = 'deposit' THEN 'Deposit'
    WHEN uph.installment_number IS NULL THEN 'Deposit'
    ELSE 'Installment'
  END AS payment_type,
  -- Application details
  c.name AS contract_name,
  sg.name AS studio_grade,
  -- Invoice information
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_number FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_number FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_number,
  CASE 
    WHEN uph.payment_source = 'stripe' THEN 
      (SELECT invoice_generated_at FROM public.stripe_payments WHERE id = uph.payment_id)
    ELSE 
      (SELECT invoice_generated_at FROM public.manual_payments WHERE id = uph.payment_id)
  END AS invoice_generated_at
FROM public.unified_payment_history uph
LEFT JOIN public.student_applications sa ON sa.id = uph.student_application_id
LEFT JOIN public.profiles p ON p.id = COALESCE(uph.student_id, sa.student_id)
LEFT JOIN public.contracts c ON c.id = sa.contract_id
LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
WHERE uph.payment_status = 'succeeded'
ORDER BY uph.payment_date DESC;

GRANT SELECT ON public.bank_reconciliation_report TO authenticated;

