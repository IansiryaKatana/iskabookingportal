-- PHASE 2 - Guarded cancelled-application payment relink
-- -------------------------------------------------------
-- Goal:
-- Relink payment rows currently attached to cancelled applications to the
-- correct non-cancelled replacement application when the match is unambiguous.
--
-- Safety guarantees:
-- 1) Old application must be cancelled.
-- 2) Replacement must be newer, same student, non-cancelled, same academic year.
-- 3) Exactly ONE replacement application candidate for each old application.
-- 4) No updates are performed for ambiguous/no-match cases.
-- 5) Deposit relinks are blocked when target application already has a conflicting
--    deposit intent/payment mapping.
--
-- IMPORTANT:
-- - Run PREVIEW first and review counts/sample rows.
-- - Keep EXECUTE inside an explicit transaction.
-- - Take a database backup/snapshot before running EXECUTE.

-- ============================================================================
-- 1) PREVIEW (read-only)
-- ============================================================================
WITH cancelled_apps AS (
  SELECT
    sa.id AS old_application_id,
    sa.student_id,
    sa.contract_id AS old_contract_id,
    sa.created_at AS old_created_at,
    c.academic_year_id AS old_academic_year_id
  FROM public.student_applications sa
  LEFT JOIN public.contracts c ON c.id = sa.contract_id
  WHERE sa.status = 'cancelled'
),
replacement_candidates AS (
  SELECT
    ca.old_application_id,
    sa_new.id AS new_application_id
  FROM cancelled_apps ca
  JOIN public.student_applications sa_new
    ON sa_new.student_id = ca.student_id
   AND sa_new.status <> 'cancelled'
   AND sa_new.created_at > ca.old_created_at
  LEFT JOIN public.contracts c_new ON c_new.id = sa_new.contract_id
  WHERE c_new.academic_year_id IS NOT DISTINCT FROM ca.old_academic_year_id
),
replacement_stats AS (
  SELECT
    old_application_id,
    COUNT(*)::int AS replacement_count,
    MIN(new_application_id::text)::uuid AS single_new_application_id
  FROM replacement_candidates
  GROUP BY old_application_id
),
payment_rows AS (
  SELECT
    'manual'::text AS source,
    mp.id::uuid AS payment_row_id,
    mp.application_id AS old_application_id,
    mp.payment_type,
    mp.amount,
    mp.payment_date::timestamptz AS payment_timestamp
  FROM public.manual_payments mp
  WHERE mp.application_id IS NOT NULL
  UNION ALL
  SELECT
    'stripe'::text AS source,
    sp.id::uuid AS payment_row_id,
    sp.student_application_id AS old_application_id,
    sp.payment_type,
    sp.amount,
    sp.created_at AS payment_timestamp
  FROM public.stripe_payments sp
  WHERE sp.student_application_id IS NOT NULL
),
joined AS (
  SELECT
    pr.source,
    pr.payment_row_id,
    pr.old_application_id,
    rs.single_new_application_id AS new_application_id,
    rs.replacement_count,
    pr.payment_type,
    pr.amount,
    pr.payment_timestamp
  FROM payment_rows pr
  JOIN cancelled_apps ca ON ca.old_application_id = pr.old_application_id
  LEFT JOIN replacement_stats rs ON rs.old_application_id = pr.old_application_id
),
classified AS (
  SELECT
    j.*,
    CASE
      WHEN j.replacement_count IS NULL OR j.replacement_count = 0 THEN 'no_replacement'
      WHEN j.replacement_count > 1 THEN 'ambiguous_replacement'
      ELSE 'eligible'
    END AS decision
  FROM joined j
),
deposit_conflicts AS (
  SELECT
    c.source,
    c.payment_row_id
  FROM classified c
  JOIN public.student_applications sa_new
    ON sa_new.id = c.new_application_id
  WHERE c.decision = 'eligible'
    AND c.payment_type = 'deposit'
    AND (
      (c.source = 'manual' AND sa_new.deposit_payment_intent_id IS NOT NULL
       AND sa_new.deposit_payment_intent_id <> ('manual-' || c.payment_row_id::text))
      OR
      (c.source = 'stripe' AND sa_new.deposit_payment_intent_id IS NOT NULL
       AND sa_new.deposit_payment_intent_id <> (
         SELECT sp2.stripe_payment_intent_id
         FROM public.stripe_payments sp2
         WHERE sp2.id = c.payment_row_id
       ))
    )
),
final_preview AS (
  SELECT
    c.*,
    CASE
      WHEN c.decision <> 'eligible' THEN c.decision
      WHEN dc.payment_row_id IS NOT NULL THEN 'blocked_deposit_conflict'
      ELSE 'will_relink'
    END AS final_decision
  FROM classified c
  LEFT JOIN deposit_conflicts dc
    ON dc.source = c.source
   AND dc.payment_row_id = c.payment_row_id
)
SELECT
  final_decision,
  source,
  payment_type,
  COUNT(*) AS row_count,
  COALESCE(SUM(amount), 0) AS total_amount
FROM final_preview
GROUP BY final_decision, source, payment_type
ORDER BY final_decision, source, payment_type;

-- Optional detailed preview:
-- Uncomment to inspect exact rows before execute.
-- WITH ... same CTE chain as above until final_preview
-- SELECT *
-- FROM final_preview
-- ORDER BY payment_timestamp DESC, source, payment_row_id;


-- ============================================================================
-- 2) EXECUTE (writes) - run only after preview review
-- ============================================================================
-- BEGIN;
--
-- -- Rebuild the same decision set in temp table for deterministic execution
-- CREATE TEMP TABLE tmp_phase2_actions AS
-- WITH cancelled_apps AS (
--   SELECT
--     sa.id AS old_application_id,
--     sa.student_id,
--     sa.contract_id AS old_contract_id,
--     sa.created_at AS old_created_at,
--     c.academic_year_id AS old_academic_year_id
--   FROM public.student_applications sa
--   LEFT JOIN public.contracts c ON c.id = sa.contract_id
--   WHERE sa.status = 'cancelled'
-- ),
-- replacement_candidates AS (
--   SELECT
--     ca.old_application_id,
--     sa_new.id AS new_application_id
--   FROM cancelled_apps ca
--   JOIN public.student_applications sa_new
--     ON sa_new.student_id = ca.student_id
--    AND sa_new.status <> 'cancelled'
--    AND sa_new.created_at > ca.old_created_at
--   LEFT JOIN public.contracts c_new ON c_new.id = sa_new.contract_id
--   WHERE c_new.academic_year_id IS NOT DISTINCT FROM ca.old_academic_year_id
-- ),
-- replacement_stats AS (
--   SELECT
--     old_application_id,
--     COUNT(*)::int AS replacement_count,
--     MIN(new_application_id::text)::uuid AS single_new_application_id
--   FROM replacement_candidates
--   GROUP BY old_application_id
-- ),
-- payment_rows AS (
--   SELECT
--     'manual'::text AS source,
--     mp.id::uuid AS payment_row_id,
--     mp.application_id AS old_application_id,
--     mp.payment_type
--   FROM public.manual_payments mp
--   WHERE mp.application_id IS NOT NULL
--   UNION ALL
--   SELECT
--     'stripe'::text AS source,
--     sp.id::uuid AS payment_row_id,
--     sp.student_application_id AS old_application_id,
--     sp.payment_type
--   FROM public.stripe_payments sp
--   WHERE sp.student_application_id IS NOT NULL
-- ),
-- joined AS (
--   SELECT
--     pr.source,
--     pr.payment_row_id,
--     pr.old_application_id,
--     rs.single_new_application_id AS new_application_id,
--     rs.replacement_count,
--     pr.payment_type
--   FROM payment_rows pr
--   JOIN cancelled_apps ca ON ca.old_application_id = pr.old_application_id
--   LEFT JOIN replacement_stats rs ON rs.old_application_id = pr.old_application_id
-- ),
-- classified AS (
--   SELECT
--     j.*,
--     CASE
--       WHEN j.replacement_count IS NULL OR j.replacement_count = 0 THEN 'no_replacement'
--       WHEN j.replacement_count > 1 THEN 'ambiguous_replacement'
--       ELSE 'eligible'
--     END AS decision
--   FROM joined j
-- ),
-- deposit_conflicts AS (
--   SELECT
--     c.source,
--     c.payment_row_id
--   FROM classified c
--   JOIN public.student_applications sa_new
--     ON sa_new.id = c.new_application_id
--   WHERE c.decision = 'eligible'
--     AND c.payment_type = 'deposit'
--     AND (
--       (c.source = 'manual' AND sa_new.deposit_payment_intent_id IS NOT NULL
--        AND sa_new.deposit_payment_intent_id <> ('manual-' || c.payment_row_id::text))
--       OR
--       (c.source = 'stripe' AND sa_new.deposit_payment_intent_id IS NOT NULL
--        AND sa_new.deposit_payment_intent_id <> (
--          SELECT sp2.stripe_payment_intent_id
--          FROM public.stripe_payments sp2
--          WHERE sp2.id = c.payment_row_id
--        ))
--     )
-- ),
-- final_actions AS (
--   SELECT
--     c.*,
--     CASE
--       WHEN c.decision <> 'eligible' THEN c.decision
--       WHEN dc.payment_row_id IS NOT NULL THEN 'blocked_deposit_conflict'
--       ELSE 'will_relink'
--     END AS final_decision
--   FROM classified c
--   LEFT JOIN deposit_conflicts dc
--     ON dc.source = c.source
--    AND dc.payment_row_id = c.payment_row_id
-- )
-- SELECT *
-- FROM final_actions;
--
-- -- Manual payments: move application link
-- UPDATE public.manual_payments mp
-- SET application_id = a.new_application_id
-- FROM tmp_phase2_actions a
-- WHERE a.final_decision = 'will_relink'
--   AND a.source = 'manual'
--   AND a.payment_row_id = mp.id;
--
-- -- Stripe payments: move application link
-- UPDATE public.stripe_payments sp
-- SET student_application_id = a.new_application_id
-- FROM tmp_phase2_actions a
-- WHERE a.final_decision = 'will_relink'
--   AND a.source = 'stripe'
--   AND a.payment_row_id = sp.id;
--
-- -- Align deposit intent pointer for moved deposit payments (manual)
-- UPDATE public.student_applications sa
-- SET deposit_payment_intent_id = 'manual-' || a.payment_row_id::text
-- FROM tmp_phase2_actions a
-- WHERE a.final_decision = 'will_relink'
--   AND a.source = 'manual'
--   AND a.payment_type = 'deposit'
--   AND sa.id = a.new_application_id;
--
-- -- Align deposit intent pointer for moved deposit payments (stripe)
-- UPDATE public.student_applications sa
-- SET deposit_payment_intent_id = sp.stripe_payment_intent_id
-- FROM tmp_phase2_actions a
-- JOIN public.stripe_payments sp ON sp.id = a.payment_row_id
-- WHERE a.final_decision = 'will_relink'
--   AND a.source = 'stripe'
--   AND a.payment_type = 'deposit'
--   AND sa.id = a.new_application_id;
--
-- -- Final execution summary
-- SELECT
--   final_decision,
--   source,
--   payment_type,
--   COUNT(*) AS row_count
-- FROM tmp_phase2_actions
-- GROUP BY final_decision, source, payment_type
-- ORDER BY final_decision, source, payment_type;
--
-- COMMIT;
-- -- ROLLBACK; -- Use instead of COMMIT while testing.

