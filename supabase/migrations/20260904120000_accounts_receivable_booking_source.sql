-- Add booking_source to accounts_receivable_report so AR CSV exports can include it.

CREATE OR REPLACE VIEW public.accounts_receivable_report
WITH (security_invoker = true)
AS
 SELECT sa.id AS application_id,
    sa.student_id,
    (p.first_name || ' '::text) || p.last_name AS student_name,
    sa.status AS application_status,
    c.name AS contract_name,
    sg.name AS studio_grade,
    sa.total_contract_value,
    COALESCE(ac.cashback_amount, 0::numeric) AS cashback_amount,
    COALESCE(sa.discount_amount, 0::numeric) AS discount_amount,
    COALESCE(sa.total_contract_value, 0::numeric) - COALESCE(ac.cashback_amount, 0::numeric) - COALESCE(sa.discount_amount, 0::numeric) AS adjusted_contract_value,
    COALESCE(ps.total_due, 0::numeric) AS total_due,
    COALESCE(ps.total_paid, 0::numeric) AS total_paid,
    COALESCE(ps.remaining_balance, 0::numeric) AS outstanding_balance,
    ps.payment_status,
    public.get_early_check_in_remaining(sa.id) AS early_check_in_outstanding,
    COALESCE(ps.remaining_balance, 0::numeric) + public.get_early_check_in_remaining(sa.id) AS total_outstanding,
    sa.assigned_studio_id,
    s.studio_number,
    sa.created_at AS application_date,
    c.contract_start,
    c.contract_end,
    ay.name AS academic_year_name,
    resolve_payment_plan_label(resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan,
    sa.booking_source
   FROM student_applications sa
     LEFT JOIN profiles p ON p.id = sa.student_id
     LEFT JOIN contracts c ON c.id = sa.contract_id
     LEFT JOIN studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN LATERAL ( SELECT ac2.cashback_amount
           FROM application_cashbacks ac2
          WHERE ac2.application_id = sa.id
          ORDER BY ac2.applied_at DESC
         LIMIT 1) ac ON true
     CROSS JOIN LATERAL get_payment_summary(sa.id) ps(total_due, total_paid, remaining_balance, payment_count, last_payment_date, payment_status)
  WHERE is_committed_sale_status(sa.status)
    AND (
      COALESCE(ps.remaining_balance, 0::numeric) > 0::numeric
      OR public.get_early_check_in_remaining(sa.id) > 0::numeric
    );

GRANT SELECT ON public.accounts_receivable_report TO authenticated;

COMMENT ON VIEW public.accounts_receivable_report IS
  'Accounts Receivable Report - money owed by students, including booking source';
