-- Restore permissive staff write policies on studio catalogue tables.
-- Restrictive MFA policies were left in place without a matching GRANT-style
-- policy, so PostgREST UPDATEs returned 0 rows (406 / PGRST116).

DROP POLICY IF EXISTS "Staff insert studio grades" ON public.studio_grades;
CREATE POLICY "Staff insert studio grades"
  ON public.studio_grades
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff update studio grades" ON public.studio_grades;
CREATE POLICY "Staff update studio grades"
  ON public.studio_grades
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff delete studio grades" ON public.studio_grades;
CREATE POLICY "Staff delete studio grades"
  ON public.studio_grades
  FOR DELETE
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff insert studio grade prices" ON public.studio_grade_prices;
CREATE POLICY "Staff insert studio grade prices"
  ON public.studio_grade_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff update studio grade prices" ON public.studio_grade_prices;
CREATE POLICY "Staff update studio grade prices"
  ON public.studio_grade_prices
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff delete studio grade prices" ON public.studio_grade_prices;
CREATE POLICY "Staff delete studio grade prices"
  ON public.studio_grade_prices
  FOR DELETE
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage grade banners" ON public.studio_grade_banners;
CREATE POLICY "Staff manage grade banners"
  ON public.studio_grade_banners
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
