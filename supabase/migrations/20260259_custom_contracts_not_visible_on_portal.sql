-- Custom (student-specific) contracts should not appear on room grade (student-facing) by default.
-- Set existing custom contracts to visible_on_portal = false and document the default for new ones.

UPDATE public.contracts
SET visible_on_portal = false
WHERE student_application_id IS NOT NULL
  AND (visible_on_portal IS NULL OR visible_on_portal = true);

COMMENT ON COLUMN public.contracts.visible_on_portal IS 'When true, contract is shown on room grade detail page (student-facing). When false, contract is staff-only. Custom (student-specific) contracts should be created with visible_on_portal = false so they do not appear on room grade.';
