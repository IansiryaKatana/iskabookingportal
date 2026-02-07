-- Contract visibility: control whether contract appears on room grade (student-facing) or staff-only.
-- Staff-only contracts (e.g. custom/finance) are not shown on the portal but are available when staff create an application.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS visible_on_portal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.contracts.visible_on_portal IS 'When true, contract is shown on room grade detail page (student-facing). When false, contract is staff-only and available only when creating an application in admin.';
