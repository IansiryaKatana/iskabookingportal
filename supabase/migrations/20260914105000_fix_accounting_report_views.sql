-- Renaming get_payment_summary / get_installment_breakdown to *_internal
-- updated view rewrite OIDs. Authenticated has no EXECUTE on internals,
-- so Accounting reports returned 403. Bind views to the MFA-gated wrappers.

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
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan,
    sa.booking_source
   FROM public.student_applications sa
     LEFT JOIN public.profiles p ON p.id = sa.student_id
     LEFT JOIN public.contracts c ON c.id = sa.contract_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN LATERAL ( SELECT ac2.cashback_amount
           FROM public.application_cashbacks ac2
          WHERE ac2.application_id = sa.id
          ORDER BY ac2.applied_at DESC
         LIMIT 1) ac ON true
     CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
  WHERE public.is_committed_sale_status(sa.status)
    AND (
      COALESCE(ps.remaining_balance, 0::numeric) > 0::numeric
      OR public.get_early_check_in_remaining(sa.id) > 0::numeric
    );

CREATE OR REPLACE VIEW public.deposit_installment_breakdown AS
 SELECT sa.id AS application_id,
    sa.student_id,
    (p.first_name || ' '::text) || p.last_name AS student_name,
    c.name AS contract_name,
    sg.name AS studio_grade,
    c.academic_year_id,
    ay.name AS academic_year_name,
    sa.total_contract_value,
    COALESCE(( SELECT sum(uph.amount_paid)
           FROM public.unified_payment_history uph
          WHERE uph.student_application_id = sa.id
            AND (uph.payment_metadata ->> 'type') = 'deposit'
            AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])), 0::numeric) AS deposit_paid,
    COALESCE(c.deposit_override, pp_selected.deposit_amount, pp.deposit_amount, sgp.deposit_amount_override, 0::numeric) AS expected_deposit,
    COALESCE(( SELECT sum(uph.amount_paid)
           FROM public.unified_payment_history uph
          WHERE uph.student_application_id = sa.id
            AND (uph.payment_metadata ->> 'type') <> 'deposit'
            AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])), 0::numeric) AS installments_paid,
    COALESCE(ps.total_due, 0::numeric) AS expected_installments,
    ( SELECT count(*)
           FROM public.unified_payment_history uph
          WHERE uph.student_application_id = sa.id
            AND (uph.payment_metadata ->> 'type') = 'deposit'
            AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])) AS deposit_payment_count,
    ( SELECT count(*)
           FROM public.unified_payment_history uph
          WHERE uph.student_application_id = sa.id
            AND (uph.payment_metadata ->> 'type') <> 'deposit'
            AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])) AS installment_payment_count,
    sa.status,
    sa.created_at AS application_date,
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan
   FROM public.student_applications sa
     LEFT JOIN public.profiles p ON p.id = sa.student_id
     LEFT JOIN public.contracts c ON c.id = sa.contract_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
     LEFT JOIN public.payment_plans pp_selected ON pp_selected.id = sa.selected_payment_plan_id
     LEFT JOIN public.studio_grade_prices sgp
       ON sgp.academic_year_id = c.academic_year_id
      AND sgp.studio_grade_id = sa.studio_grade_id
      AND sgp.is_active = true
     CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
  WHERE public.is_committed_sale_status(sa.status);

CREATE OR REPLACE VIEW public.outstanding_balances_report AS
 SELECT sa.id AS application_id,
    sa.student_id,
    (p.first_name || ' '::text) || p.last_name AS student_name,
    sa.status AS application_status,
    c.name AS contract_name,
    sg.name AS studio_grade,
    c.academic_year_id,
    ay.name AS academic_year_name,
    COALESCE(ps.total_due, 0::numeric) AS total_due,
    COALESCE(ps.total_paid, 0::numeric) AS total_paid,
    COALESCE(ps.remaining_balance, 0::numeric) AS outstanding_balance,
    ( SELECT min(gb.due_date)
           FROM public.get_installment_breakdown(sa.id) gb
          WHERE gb.payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text])
            AND gb.due_date < CURRENT_DATE) AS oldest_unpaid_due_date,
        CASE
            WHEN (( SELECT min(gb.due_date)
               FROM public.get_installment_breakdown(sa.id) gb
              WHERE gb.payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text])
                AND gb.due_date < CURRENT_DATE)) IS NOT NULL
            THEN CURRENT_DATE - (( SELECT min(gb.due_date)
               FROM public.get_installment_breakdown(sa.id) gb
              WHERE gb.payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text])
                AND gb.due_date < CURRENT_DATE))
            ELSE 0
        END AS days_overdue,
    sa.created_at AS application_date,
    c.contract_start,
    c.contract_end,
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan
   FROM public.student_applications sa
     LEFT JOIN public.profiles p ON p.id = sa.student_id
     LEFT JOIN public.contracts c ON c.id = sa.contract_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
     CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
  WHERE public.is_committed_sale_status(sa.status)
    AND COALESCE(ps.remaining_balance, 0::numeric) > 0::numeric;

CREATE OR REPLACE VIEW public.upcoming_and_paid_installments_report AS
 SELECT sa.id AS application_id,
    sa.student_id,
    TRIM(BOTH FROM (COALESCE(p.first_name, ''::text) || ' '::text) || COALESCE(p.last_name, ''::text)) AS student_name,
    s.studio_number,
    sg.name AS studio_grade,
    c.id AS contract_id,
    c.name AS contract_name,
    ay.name AS academic_year_name,
    c.academic_year_id,
    gb.installment_id,
    gb.sequence,
    gb.label AS installment_label,
    gb.due_date,
    gb.amount_due AS amount,
    false AS is_deposit,
    gb.amount_paid,
    gb.remaining_amount AS amount_remaining,
    gb.payment_status = 'paid'::text AS is_paid,
        CASE
            WHEN gb.amount_paid > 0::numeric AND gb.installment_id IS NOT NULL THEN COALESCE(
              ( SELECT max(sp.created_at)::date
                 FROM public.stripe_payments sp
                WHERE sp.student_application_id = sa.id
                  AND (sp.metadata ->> 'instalment_id') = gb.installment_id::text
                  AND sp.status = ANY (ARRAY['succeeded'::text, 'completed'::text])),
              ( SELECT max(mp.payment_date)
                 FROM public.manual_payments mp
                WHERE mp.instalment_id = gb.installment_id
                  AND mp.application_id = sa.id)
            )
            ELSE NULL::date
        END AS paid_date,
        CASE
            WHEN gb.payment_status = 'paid'::text THEN 'paid'::text
            WHEN gb.payment_status = 'partial'::text THEN 'partially_paid'::text
            WHEN gb.due_date < CURRENT_DATE THEN 'overdue'::text
            ELSE 'upcoming'::text
        END AS status,
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan
   FROM public.student_applications sa
     JOIN public.contracts c ON c.id = sa.contract_id
     JOIN public.academic_years ay ON ay.id = c.academic_year_id
     CROSS JOIN LATERAL public.get_installment_breakdown(sa.id) gb
     LEFT JOIN public.profiles p ON p.id = sa.student_id
     LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
  WHERE public.is_committed_sale_status(sa.status);

CREATE OR REPLACE VIEW public.fully_paid_students
WITH (security_invoker = true)
AS
 SELECT DISTINCT sa.id AS application_id,
    sa.student_id,
    p.first_name,
    p.last_name,
    c.id AS contract_id,
    c.name AS contract_name,
    ay.id AS academic_year_id,
    ay.name AS academic_year_name,
    ps.total_due,
    ps.total_paid,
    ps.remaining_balance,
    ps.payment_status,
    ps.last_payment_date,
    sa.status AS application_status,
    sa.created_at AS application_created_at,
    s.studio_number,
    sg.name AS studio_grade_name,
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan
   FROM public.student_applications sa
     JOIN public.profiles p ON sa.student_id = p.id
     JOIN public.contracts c ON sa.contract_id = c.id
     JOIN public.academic_years ay ON c.academic_year_id = ay.id
     LEFT JOIN public.studios s ON sa.assigned_studio_id = s.id
     LEFT JOIN public.studio_grades sg ON s.studio_grade_id = sg.id
     CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
  WHERE public.is_realized_sale_status(sa.status)
    AND ps.payment_status = 'fully_paid'::text
    AND ps.remaining_balance <= 0::numeric
    AND public.get_early_check_in_remaining(sa.id) <= 0::numeric;

CREATE OR REPLACE VIEW public.student_payment_cash_flow_applications AS
 SELECT sa.id AS application_id,
    sa.student_id,
    TRIM(BOTH FROM (COALESCE(p.first_name, ''::text) || ' '::text) || COALESCE(p.last_name, ''::text)) AS student_name,
    s.studio_number,
    sg.name AS studio_grade,
    c.id AS contract_id,
    c.name AS contract_name,
    c.contract_start,
    c.contract_end,
    ay.id AS academic_year_id,
    ay.name AS academic_year_name,
    ay.start_date AS academic_year_start,
    ay.end_date AS academic_year_end,
        CASE
            WHEN sa.extension_of_application_id IS NOT NULL THEN 'extension'::text
            WHEN COALESCE(c.is_custom_duration_placeholder, false) THEN 'custom'::text
            ELSE 'standard'::text
        END AS contract_type,
    sa.extension_of_application_id,
    sa.status AS application_status,
    public.resolve_payment_plan_label(public.resolve_application_payment_plan_id(sa.selected_payment_plan_id, c.id)) AS payment_plan,
    COALESCE(c.deposit_override, pp_selected.deposit_amount, pp.deposit_amount, sgp.deposit_amount_override, 0::numeric) AS deposit_due,
    COALESCE(( SELECT sum(uph.amount_paid)
           FROM public.unified_payment_history uph
          WHERE uph.student_application_id = sa.id
            AND COALESCE(uph.payment_metadata ->> 'type', uph.payment_type) = 'deposit'
            AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])), 0::numeric) AS deposit_paid,
        CASE
            WHEN COALESCE(c.deposit_override, pp_selected.deposit_amount, pp.deposit_amount, sgp.deposit_amount_override, 0::numeric) <= 0::numeric THEN 'n/a'::text
            WHEN COALESCE(( SELECT sum(uph.amount_paid)
               FROM public.unified_payment_history uph
              WHERE uph.student_application_id = sa.id
                AND COALESCE(uph.payment_metadata ->> 'type', uph.payment_type) = 'deposit'
                AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])), 0::numeric)
              >= GREATEST(COALESCE(c.deposit_override, pp_selected.deposit_amount, pp.deposit_amount, sgp.deposit_amount_override, 0::numeric) - 0.01, 0::numeric)
            THEN 'paid'::text
            WHEN COALESCE(( SELECT sum(uph.amount_paid)
               FROM public.unified_payment_history uph
              WHERE uph.student_application_id = sa.id
                AND COALESCE(uph.payment_metadata ->> 'type', uph.payment_type) = 'deposit'
                AND uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])), 0::numeric) > 0::numeric
            THEN 'partial'::text
            ELSE 'unpaid'::text
        END AS deposit_status,
    COALESCE(ps.total_due, 0::numeric) AS total_installments_due
   FROM public.student_applications sa
     JOIN public.contracts c ON c.id = sa.contract_id
     JOIN public.academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN public.profiles p ON p.id = sa.student_id
     LEFT JOIN public.studios s ON s.id = sa.assigned_studio_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN public.payment_plans pp ON pp.id = c.payment_plan_id
     LEFT JOIN public.payment_plans pp_selected ON pp_selected.id = sa.selected_payment_plan_id
     LEFT JOIN public.studio_grade_prices sgp
       ON sgp.academic_year_id = c.academic_year_id
      AND sgp.studio_grade_id = sa.studio_grade_id
      AND sgp.is_active = true
     CROSS JOIN LATERAL public.get_payment_summary(sa.id) ps
  WHERE public.is_committed_sale_status(sa.status);

CREATE OR REPLACE VIEW public.student_payment_cash_flow_monthly AS
 WITH per_app_installments AS (
         SELECT sa.id AS application_id,
            c.academic_year_id,
            gb.due_date,
            gb.amount_due,
            gb.amount_paid,
            gb.remaining_amount
           FROM public.student_applications sa
             JOIN public.contracts c ON c.id = sa.contract_id
             CROSS JOIN LATERAL public.get_installment_breakdown(sa.id) gb
          WHERE public.is_committed_sale_status(sa.status)
        ), due_by_month AS (
         SELECT pai.application_id,
            pai.academic_year_id,
            to_char(date_trunc('month', pai.due_date::timestamp with time zone)::date::timestamp with time zone, 'YYYY-MM') AS month_key,
            date_trunc('month', pai.due_date::timestamp with time zone)::date AS month_start,
            upper(to_char(date_trunc('month', pai.due_date::timestamp with time zone)::date::timestamp with time zone, 'Mon')) AS month_label,
            sum(pai.amount_due) AS amount_due,
            sum(pai.amount_paid) AS amount_paid_on_due,
            GREATEST(sum(pai.remaining_amount), 0::numeric) AS amount_remaining,
            max(pai.due_date) AS latest_due_date_in_month
           FROM per_app_installments pai
          GROUP BY pai.application_id, pai.academic_year_id, (date_trunc('month', pai.due_date::timestamp with time zone)::date)
        ), collected_by_month AS (
         SELECT uph.student_application_id AS application_id,
            c.academic_year_id,
            to_char(date_trunc('month', uph.payment_date)::date::timestamp with time zone, 'YYYY-MM') AS month_key,
            date_trunc('month', uph.payment_date)::date AS month_start,
            upper(to_char(date_trunc('month', uph.payment_date)::date::timestamp with time zone, 'Mon')) AS month_label,
            sum(uph.amount_paid) AS amount_collected
           FROM public.unified_payment_history uph
             JOIN public.student_applications sa ON sa.id = uph.student_application_id
             JOIN public.contracts c ON c.id = sa.contract_id
          WHERE uph.payment_status = ANY (ARRAY['succeeded'::text, 'completed'::text])
            AND COALESCE(uph.payment_metadata ->> 'type', uph.payment_type) <> 'deposit'
            AND public.is_committed_sale_status(sa.status)
          GROUP BY uph.student_application_id, c.academic_year_id, (date_trunc('month', uph.payment_date)::date)
        ), merged AS (
         SELECT COALESCE(d.application_id, c.application_id) AS application_id,
            COALESCE(d.academic_year_id, c.academic_year_id) AS academic_year_id,
            COALESCE(d.month_key, c.month_key) AS month_key,
            COALESCE(d.month_start, c.month_start) AS month_start,
            COALESCE(d.month_label, c.month_label) AS month_label,
            COALESCE(d.amount_due, 0::numeric) AS amount_due,
            COALESCE(d.amount_paid_on_due, 0::numeric) AS amount_paid_on_due,
            COALESCE(d.amount_remaining, 0::numeric) AS amount_remaining,
            COALESCE(c.amount_collected, 0::numeric) AS amount_collected,
            d.latest_due_date_in_month
           FROM due_by_month d
             FULL JOIN collected_by_month c
               ON c.application_id = d.application_id
              AND c.academic_year_id = d.academic_year_id
              AND d.month_key = c.month_key
        )
 SELECT application_id,
    academic_year_id,
    month_key,
    month_start,
    month_label,
    amount_due,
    amount_paid_on_due,
    amount_remaining,
    amount_collected,
        CASE
            WHEN amount_due <= 0::numeric AND amount_collected > 0::numeric THEN 'collected_only'::text
            WHEN amount_due <= 0::numeric THEN 'empty'::text
            WHEN amount_paid_on_due >= GREATEST(amount_due - 0.01, 0::numeric) THEN 'paid'::text
            WHEN amount_paid_on_due > 0::numeric THEN 'partially_paid'::text
            WHEN latest_due_date_in_month IS NOT NULL AND latest_due_date_in_month < CURRENT_DATE THEN 'overdue'::text
            ELSE 'upcoming'::text
        END AS month_status
   FROM merged m;

CREATE OR REPLACE VIEW public.early_check_ins_payment_ledger
WITH (security_invoker = true)
AS
 SELECT eci.id AS early_check_in_id,
    eci.application_id,
    eci.studio_id,
    eci.early_check_in_date,
    eci.early_check_out_date,
    eci.nights,
    eci.nightly_rate,
    eci.total_amount,
    eci.currency,
    eci.status AS eci_status,
    eci.notes,
    eci.created_at,
    sa.status AS application_status,
    sa.student_id,
    c.academic_year_id,
    ay.name AS academic_year_name,
    c.name AS contract_name,
    c.contract_start,
    s.studio_number,
    sg.name AS studio_grade,
    COALESCE(
      NULLIF(TRIM(BOTH FROM (COALESCE(pr.first_name, ''::text) || ' '::text) || COALESCE(pr.last_name, ''::text)), ''::text),
      NULLIF(TRIM(BOTH FROM (COALESCE(step1.payload ->> 'first_name', ''::text) || ' '::text) || COALESCE(step1.payload ->> 'last_name', ''::text)), ''::text),
      'Unknown student'::text
    ) AS student_name,
    ps.amount_due,
    ps.total_received,
    ps.remaining_balance,
    ps.payment_count,
    ps.last_payment_date,
    ps.payment_status
   FROM public.early_check_ins eci
     JOIN public.student_applications sa ON sa.id = eci.application_id
     LEFT JOIN public.contracts c ON c.id = sa.contract_id
     LEFT JOIN public.academic_years ay ON ay.id = c.academic_year_id
     LEFT JOIN public.studios s ON s.id = eci.studio_id
     LEFT JOIN public.studio_grades sg ON sg.id = sa.studio_grade_id
     LEFT JOIN public.profiles pr ON pr.id = sa.student_id
     LEFT JOIN LATERAL (
       SELECT sas.payload
         FROM public.student_application_steps sas
        WHERE sas.application_id = sa.id AND sas.step_number = 1
        ORDER BY sas.updated_at DESC NULLS LAST
        LIMIT 1
     ) step1 ON true
     CROSS JOIN LATERAL public.get_early_check_in_payment_summary(eci.application_id) ps;

CREATE OR REPLACE VIEW public.ota_bookings_payment_ledger AS
 SELECT ob.id AS booking_id,
    ob.external_ref,
    ob.channel,
    ob.guest_name,
    ob.studio_id,
    ob.check_in,
    ob.check_out,
    ob.status AS booking_status,
    ob.price_per_night,
    ob.commission_amount,
    ob.total_revenue,
    ob.number_of_nights,
    ob.currency,
    ps.gross_booking_value,
    ps.amount_due,
    ps.total_received,
    ps.remaining_balance,
    ps.payment_count,
    ps.last_payment_date,
    ps.payment_status
   FROM public.ota_bookings ob
     CROSS JOIN LATERAL public.get_ota_payment_summary(ob.id) ps;

REVOKE ALL ON TABLE public.accounts_receivable_report FROM anon;
REVOKE ALL ON TABLE public.deposit_installment_breakdown FROM anon;
REVOKE ALL ON TABLE public.outstanding_balances_report FROM anon;
REVOKE ALL ON TABLE public.upcoming_and_paid_installments_report FROM anon;
REVOKE ALL ON TABLE public.fully_paid_students FROM anon;
REVOKE ALL ON TABLE public.student_payment_cash_flow_applications FROM anon;
REVOKE ALL ON TABLE public.student_payment_cash_flow_monthly FROM anon;
REVOKE ALL ON TABLE public.early_check_ins_payment_ledger FROM anon;
REVOKE ALL ON TABLE public.ota_bookings_payment_ledger FROM anon;

GRANT SELECT ON TABLE public.accounts_receivable_report TO authenticated;
GRANT SELECT ON TABLE public.deposit_installment_breakdown TO authenticated;
GRANT SELECT ON TABLE public.outstanding_balances_report TO authenticated;
GRANT SELECT ON TABLE public.upcoming_and_paid_installments_report TO authenticated;
GRANT SELECT ON TABLE public.fully_paid_students TO authenticated;
GRANT SELECT ON TABLE public.student_payment_cash_flow_applications TO authenticated;
GRANT SELECT ON TABLE public.student_payment_cash_flow_monthly TO authenticated;
GRANT SELECT ON TABLE public.early_check_ins_payment_ledger TO authenticated;
GRANT SELECT ON TABLE public.ota_bookings_payment_ledger TO authenticated;
