-- PHASE 1 (PREVIEW ONLY) - Cancelled application payment cleanup candidates
-- -----------------------------------------------------------------------
-- This script does NOT modify any data.
-- It helps identify payment rows linked to cancelled applications where a
-- likely replacement (non-cancelled) application exists for the same student.
--
-- Safety logic for "candidate to move/delete later":
-- 1) Old app status = cancelled
-- 2) New app status != cancelled
-- 3) Same student_id
-- 4) New app created AFTER old app
-- 5) Same academic year (via contracts.academic_year_id)
--
-- Run in Supabase SQL Editor, review outputs, then decide next step.

-- 1) High-level summary
WITH cancelled_apps AS (
  SELECT
    sa.id AS old_application_id,
    sa.student_id,
    sa.contract_id AS old_contract_id,
    sa.created_at AS old_created_at,
    sa.status AS old_status,
    c.academic_year_id AS old_academic_year_id
  FROM public.student_applications sa
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.status = 'cancelled'
),
replacement_apps AS (
  SELECT
    ca.old_application_id,
    sa_new.id AS new_application_id,
    ROW_NUMBER() OVER (
      PARTITION BY ca.old_application_id
      ORDER BY sa_new.created_at DESC
    ) AS rn
  FROM cancelled_apps ca
  JOIN public.student_applications sa_new
    ON sa_new.student_id = ca.student_id
   AND sa_new.status <> 'cancelled'
   AND sa_new.created_at > ca.old_created_at
  LEFT JOIN public.contracts c_new ON c_new.id = sa_new.contract_id
  WHERE c_new.academic_year_id IS NOT DISTINCT FROM ca.old_academic_year_id
),
best_replacement AS (
  SELECT old_application_id, new_application_id
  FROM replacement_apps
  WHERE rn = 1
),
cancelled_payment_rows AS (
  SELECT
    'manual'::text AS source,
    mp.id::text AS payment_row_id,
    mp.application_id AS old_application_id,
    mp.payment_type,
    mp.amount,
    mp.payment_date::timestamptz AS payment_timestamp,
    mp.receipt_number,
    NULL::text AS stripe_payment_intent_id
  FROM public.manual_payments mp
  UNION ALL
  SELECT
    'stripe'::text AS source,
    sp.id::text AS payment_row_id,
    sp.student_application_id AS old_application_id,
    sp.payment_type,
    sp.amount,
    sp.created_at AS payment_timestamp,
    NULL::text AS receipt_number,
    sp.stripe_payment_intent_id
  FROM public.stripe_payments sp
),
candidates AS (
  SELECT
    cpr.source,
    cpr.payment_row_id,
    cpr.old_application_id,
    br.new_application_id,
    cpr.payment_type,
    cpr.amount,
    cpr.payment_timestamp,
    cpr.receipt_number,
    cpr.stripe_payment_intent_id
  FROM cancelled_payment_rows cpr
  JOIN best_replacement br ON br.old_application_id = cpr.old_application_id
)
SELECT
  source,
  payment_type,
  COUNT(*) AS row_count,
  COALESCE(SUM(amount), 0) AS total_amount
FROM candidates
GROUP BY source, payment_type
ORDER BY source, payment_type;

-- 2) Detailed preview rows (review this carefully)
WITH cancelled_apps AS (
  SELECT
    sa.id AS old_application_id,
    sa.student_id,
    sa.contract_id AS old_contract_id,
    sa.created_at AS old_created_at,
    sa.status AS old_status,
    c.academic_year_id AS old_academic_year_id
  FROM public.student_applications sa
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.status = 'cancelled'
),
replacement_apps AS (
  SELECT
    ca.old_application_id,
    sa_new.id AS new_application_id,
    ROW_NUMBER() OVER (
      PARTITION BY ca.old_application_id
      ORDER BY sa_new.created_at DESC
    ) AS rn
  FROM cancelled_apps ca
  JOIN public.student_applications sa_new
    ON sa_new.student_id = ca.student_id
   AND sa_new.status <> 'cancelled'
   AND sa_new.created_at > ca.old_created_at
  LEFT JOIN public.contracts c_new ON c_new.id = sa_new.contract_id
  WHERE c_new.academic_year_id IS NOT DISTINCT FROM ca.old_academic_year_id
),
best_replacement AS (
  SELECT old_application_id, new_application_id
  FROM replacement_apps
  WHERE rn = 1
),
cancelled_payment_rows AS (
  SELECT
    'manual'::text AS source,
    mp.id::text AS payment_row_id,
    mp.application_id AS old_application_id,
    mp.payment_type,
    mp.amount,
    mp.payment_date::timestamptz AS payment_timestamp,
    mp.receipt_number,
    NULL::text AS stripe_payment_intent_id
  FROM public.manual_payments mp
  UNION ALL
  SELECT
    'stripe'::text AS source,
    sp.id::text AS payment_row_id,
    sp.student_application_id AS old_application_id,
    sp.payment_type,
    sp.amount,
    sp.created_at AS payment_timestamp,
    NULL::text AS receipt_number,
    sp.stripe_payment_intent_id
  FROM public.stripe_payments sp
),
candidates AS (
  SELECT
    cpr.source,
    cpr.payment_row_id,
    cpr.old_application_id,
    br.new_application_id,
    cpr.payment_type,
    cpr.amount,
    cpr.payment_timestamp,
    cpr.receipt_number,
    cpr.stripe_payment_intent_id
  FROM cancelled_payment_rows cpr
  JOIN best_replacement br ON br.old_application_id = cpr.old_application_id
)
SELECT
  source,
  payment_row_id,
  payment_type,
  amount,
  payment_timestamp,
  old_application_id,
  new_application_id,
  receipt_number,
  stripe_payment_intent_id
FROM candidates
ORDER BY payment_timestamp DESC, source, payment_row_id;

-- 3) Rows on cancelled apps that have NO safe replacement match (keep/analyze manually)
WITH cancelled_apps AS (
  SELECT
    sa.id AS old_application_id,
    sa.student_id,
    sa.contract_id AS old_contract_id,
    sa.created_at AS old_created_at,
    sa.status AS old_status,
    c.academic_year_id AS old_academic_year_id
  FROM public.student_applications sa
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.status = 'cancelled'
),
replacement_apps AS (
  SELECT
    ca.old_application_id,
    sa_new.id AS new_application_id,
    ROW_NUMBER() OVER (
      PARTITION BY ca.old_application_id
      ORDER BY sa_new.created_at DESC
    ) AS rn
  FROM cancelled_apps ca
  JOIN public.student_applications sa_new
    ON sa_new.student_id = ca.student_id
   AND sa_new.status <> 'cancelled'
   AND sa_new.created_at > ca.old_created_at
  LEFT JOIN public.contracts c_old ON c_old.id = ca.old_contract_id
  LEFT JOIN public.contracts c_new ON c_new.id = sa_new.contract_id
  WHERE c_new.academic_year_id IS NOT DISTINCT FROM c_old.academic_year_id
),
best_replacement AS (
  SELECT old_application_id, new_application_id
  FROM replacement_apps
  WHERE rn = 1
),
cancelled_payment_rows AS (
  SELECT
    'manual'::text AS source,
    mp.id::text AS payment_row_id,
    mp.application_id AS old_application_id,
    mp.payment_type,
    mp.amount,
    mp.payment_date::timestamptz AS payment_timestamp
  FROM public.manual_payments mp
  UNION ALL
  SELECT
    'stripe'::text AS source,
    sp.id::text AS payment_row_id,
    sp.student_application_id AS old_application_id,
    sp.payment_type,
    sp.amount,
    sp.created_at AS payment_timestamp
  FROM public.stripe_payments sp
)
SELECT
  cpr.*
FROM cancelled_payment_rows cpr
LEFT JOIN best_replacement br ON br.old_application_id = cpr.old_application_id
WHERE br.new_application_id IS NULL
ORDER BY cpr.payment_timestamp DESC, cpr.source, cpr.payment_row_id;
