CREATE INDEX IF NOT EXISTS idx_student_applications_contract_created
  ON public.student_applications (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_academic_year_id
  ON public.contracts (academic_year_id);
