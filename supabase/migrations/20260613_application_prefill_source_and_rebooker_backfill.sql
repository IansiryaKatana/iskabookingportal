-- Resolve the best prior application to pre-fill journey steps (rebooker / extension).
-- Prefers confirmed applications with saved step data, then most recent.

CREATE OR REPLACE FUNCTION public.get_student_prefill_source_application(
  p_student_id UUID,
  p_exclude_application_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sa.id
  FROM public.student_applications sa
  WHERE sa.student_id = p_student_id
    AND (p_exclude_application_id IS NULL OR sa.id <> p_exclude_application_id)
    AND EXISTS (
      SELECT 1
      FROM public.student_application_steps s
      WHERE s.application_id = sa.id
    )
  ORDER BY
    CASE WHEN sa.status = 'confirmed' THEN 0 ELSE 1 END,
    sa.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_prefill_source_application(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_student_prefill_source_application IS
  'Returns the best prior student application to pre-fill journey steps (staff rebooker, extensions).';

-- Backfill rebooker applications created without previous_application_id (mostly staff-created).
UPDATE public.student_applications r
SET previous_application_id = public.get_student_prefill_source_application(r.student_id, r.id)
WHERE r.is_rebooking = true
  AND r.previous_application_id IS NULL
  AND public.get_student_prefill_source_application(r.student_id, r.id) IS NOT NULL;
