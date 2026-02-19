-- Custom (student-specific) contracts and payment plans.
-- When staff customise payment schedule on an application, we create new contract + plan
-- and point the application to them. These columns mark such records so we can filter
-- them in admin (e.g. hide from main contract list / prevent editing as template).

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_contract_id uuid REFERENCES public.contracts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_application_id uuid REFERENCES public.student_applications (id) ON DELETE SET NULL;

ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS source_payment_plan_id uuid REFERENCES public.payment_plans (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_application_id uuid REFERENCES public.student_applications (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_student_application_id
  ON public.contracts (student_application_id)
  WHERE student_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_source_contract_id
  ON public.contracts (source_contract_id)
  WHERE source_contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_plans_student_application_id
  ON public.payment_plans (student_application_id)
  WHERE student_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_plans_source_plan_id
  ON public.payment_plans (source_payment_plan_id)
  WHERE source_payment_plan_id IS NOT NULL;

COMMENT ON COLUMN public.contracts.source_contract_id IS 'When set, this contract is a per-application clone of that contract.';
COMMENT ON COLUMN public.contracts.student_application_id IS 'When set, this contract is used only by this application (custom schedule).';
COMMENT ON COLUMN public.payment_plans.source_payment_plan_id IS 'When set, this plan is a per-application clone of that plan.';
COMMENT ON COLUMN public.payment_plans.student_application_id IS 'When set, this plan is used only by this application (custom schedule).';
