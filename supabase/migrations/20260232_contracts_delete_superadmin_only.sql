-- Restrict contract DELETE to superadmin only. Staff keep SELECT, INSERT, UPDATE.
-- Replace single "all" policy with operation-specific policies.

DROP POLICY IF EXISTS "Staff manage contracts" ON public.contracts;

CREATE POLICY "Staff select contracts"
  ON public.contracts
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Staff insert contracts"
  ON public.contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff update contracts"
  ON public.contracts
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Superadmin delete contracts"
  ON public.contracts
  FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

COMMENT ON POLICY "Superadmin delete contracts" ON public.contracts IS 'Only superadmin can delete contracts. Deletion is blocked by DB if contract has applications (ON DELETE RESTRICT on student_applications.contract_id).';
