-- Allow staff and admin to manage payment_plans and payment_plan_installments.
-- Fixes 403 on save when user has role 'admin' (is_staff() only checks 'staff' and 'superadmin').

-- payment_plans: ensure staff or admin can manage
DROP POLICY IF EXISTS "Staff manage payment plans" ON public.payment_plans;
DROP POLICY IF EXISTS "Staff can manage payment plans" ON public.payment_plans;
CREATE POLICY "Staff manage payment plans"
  ON public.payment_plans
  FOR ALL
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- payment_plan_installments: ensure staff or admin can manage (fixes 403 on insert/delete)
DROP POLICY IF EXISTS "Staff manage plan installments" ON public.payment_plan_installments;
CREATE POLICY "Staff manage plan installments"
  ON public.payment_plan_installments
  FOR ALL
  TO authenticated
  USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Ensure grants for authenticated (in case they were missing)
GRANT INSERT, UPDATE, DELETE ON public.payment_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_plan_installments TO authenticated;
