-- COMPREHENSIVE FIX: Recreate ALL RLS policies that use is_staff()
-- This ensures everything works after fixing the is_staff() function
-- Run this ENTIRE script in Supabase Dashboard > SQL Editor

-- Step 1: Verify is_staff() is working
SELECT 
  'Step 1: Checking is_staff() function' AS step,
  public.is_staff() AS is_staff_result,
  auth.uid() AS current_user_id;

-- Step 2: Find ALL policies that use is_staff()
SELECT 
  'Step 2: Policies using is_staff()' AS step,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE qual LIKE '%is_staff%' 
   OR with_check LIKE '%is_staff%'
ORDER BY tablename, policyname;

-- Step 3: Fix student_applications policies (already done, but ensuring they're correct)
DROP POLICY IF EXISTS "Students insert applications" ON public.student_applications;
DROP POLICY IF EXISTS "Students manage own applications" ON public.student_applications;
DROP POLICY IF EXISTS "Students update own applications" ON public.student_applications;
DROP POLICY IF EXISTS "Staff manage applications" ON public.student_applications;

CREATE POLICY "Students insert applications"
  ON public.student_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students manage own applications"
  ON public.student_applications
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_staff()
  );

CREATE POLICY "Students update own applications"
  ON public.student_applications
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_staff()
  )
  WITH CHECK (
    student_id = auth.uid()
    OR public.is_staff()
  );

CREATE POLICY "Staff manage applications"
  ON public.student_applications
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 4: Fix partners policies
DROP POLICY IF EXISTS "Staff can view all partners" ON public.partners;
DROP POLICY IF EXISTS "Staff can manage partners" ON public.partners;

CREATE POLICY "Staff can view all partners" ON public.partners
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can manage partners" ON public.partners
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 5: Fix partner_referrals policies
DROP POLICY IF EXISTS "Staff can view all partner referrals" ON public.partner_referrals;
DROP POLICY IF EXISTS "Staff can manage partner referrals" ON public.partner_referrals;

CREATE POLICY "Staff can view all partner referrals" ON public.partner_referrals
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can manage partner referrals" ON public.partner_referrals
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 6: Fix profiles policies
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff manage profiles" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.is_staff()
  );

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE 
  USING (
    auth.uid() = id
    OR public.is_staff()
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_staff()
  );

CREATE POLICY "Staff manage profiles" ON public.profiles
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 7: Fix student_application_steps policies
DROP POLICY IF EXISTS "Students manage own steps" ON public.student_application_steps;
DROP POLICY IF EXISTS "Staff manage steps" ON public.student_application_steps;

CREATE POLICY "Students manage own steps"
  ON public.student_application_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_applications a
      WHERE a.id = application_id
        AND a.student_id = auth.uid()
    )
    OR public.is_staff()
  );

CREATE POLICY "Staff manage steps"
  ON public.student_application_steps
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 8: Fix student_documents policies
DROP POLICY IF EXISTS "Students manage own documents" ON public.student_documents;
DROP POLICY IF EXISTS "Staff manage documents" ON public.student_documents;

CREATE POLICY "Students manage own documents"
  ON public.student_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_applications a
      WHERE a.id = application_id
        AND a.student_id = auth.uid()
    )
    OR public.is_staff()
  );

CREATE POLICY "Staff manage documents"
  ON public.student_documents
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 9: Fix studios policies
DROP POLICY IF EXISTS "Staff manage studios" ON public.studios;

CREATE POLICY "Staff manage studios"
  ON public.studios
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 10: Fix contracts policies
DROP POLICY IF EXISTS "Staff manage contracts" ON public.contracts;

CREATE POLICY "Staff manage contracts"
  ON public.contracts
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 11: Fix academic_years policies
DROP POLICY IF EXISTS "Staff manage academic years" ON public.academic_years;

CREATE POLICY "Staff manage academic years"
  ON public.academic_years
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 12: Fix cashback_campaigns policies
DROP POLICY IF EXISTS "Staff can view all cashback campaigns" ON public.cashback_campaigns;
DROP POLICY IF EXISTS "Staff can manage cashback campaigns" ON public.cashback_campaigns;

CREATE POLICY "Staff can view all cashback campaigns" ON public.cashback_campaigns
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can manage cashback campaigns" ON public.cashback_campaigns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 13: Fix notifications policies
DROP POLICY IF EXISTS "Staff can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff can view all notifications" ON public.notifications;

CREATE POLICY "Staff can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY "Staff can view all notifications" ON public.notifications
  FOR SELECT USING (public.is_staff());

-- Step 14: Fix financial_forecasts policies
DROP POLICY IF EXISTS "Staff manage forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Staff view forecast breakdowns" ON public.financial_forecast_breakdowns;
DROP POLICY IF EXISTS "Staff manage forecast breakdowns" ON public.financial_forecast_breakdowns;

CREATE POLICY "Staff manage forecasts" ON public.financial_forecasts
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff view forecast breakdowns" ON public.financial_forecast_breakdowns
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff manage forecast breakdowns" ON public.financial_forecast_breakdowns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 15: Fix docusign_envelopes policies
DROP POLICY IF EXISTS "Students can view own envelopes" ON public.docusign_envelopes;
DROP POLICY IF EXISTS "Staff can manage envelopes" ON public.docusign_envelopes;

CREATE POLICY "Students can view own envelopes"
  ON public.docusign_envelopes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_applications a
      WHERE a.id = application_id
        AND (a.student_id = auth.uid() OR public.is_staff())
    )
  );

CREATE POLICY "Staff can manage envelopes"
  ON public.docusign_envelopes
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 16: Fix manual_payments policies
DROP POLICY IF EXISTS "Staff can manage manual payments" ON public.manual_payments;

CREATE POLICY "Staff can manage manual payments" ON public.manual_payments
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 17: Fix payment_plans policies (if they exist)
DROP POLICY IF EXISTS "Staff can manage payment plans" ON public.payment_plans;

CREATE POLICY "Staff can manage payment plans" ON public.payment_plans
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 18: Fix branding_settings policies
DROP POLICY IF EXISTS "Staff can manage branding" ON public.branding_settings;

CREATE POLICY "Staff can manage branding" ON public.branding_settings
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 19: Fix email_templates policies
DROP POLICY IF EXISTS "Staff can insert email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Staff can view all email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Staff can manage email templates" ON public.email_templates;

CREATE POLICY "Staff can insert email templates" ON public.email_templates
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY "Staff can view all email templates" ON public.email_templates
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can manage email templates" ON public.email_templates
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 20: Fix stripe_payments policies
DROP POLICY IF EXISTS "Staff can view all stripe payments" ON public.stripe_payments;
DROP POLICY IF EXISTS "Staff can insert stripe payments" ON public.stripe_payments;
DROP POLICY IF EXISTS "Staff can update stripe payments" ON public.stripe_payments;

CREATE POLICY "Staff can view all stripe payments" ON public.stripe_payments
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can insert stripe payments" ON public.stripe_payments
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update stripe payments" ON public.stripe_payments
  FOR UPDATE USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 21: Fix refunds policies
DROP POLICY IF EXISTS "Staff can view all refunds" ON public.refunds;
DROP POLICY IF EXISTS "Staff can insert refunds" ON public.refunds;

CREATE POLICY "Staff can view all refunds" ON public.refunds
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can insert refunds" ON public.refunds
  FOR INSERT WITH CHECK (public.is_staff());

-- Step 21.5: Fix bulk_messages policies
DROP POLICY IF EXISTS "Staff manage bulk messages" ON public.bulk_messages;

CREATE POLICY "Staff manage bulk messages" ON public.bulk_messages
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 22: Verify all policies were created
SELECT 
  'Step 22: Verification - All policies using is_staff()' AS step,
  tablename,
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN 'Has WITH CHECK' ELSE 'No WITH CHECK' END AS has_with_check
FROM pg_policies
WHERE qual LIKE '%is_staff%' 
   OR with_check LIKE '%is_staff%'
ORDER BY tablename, policyname;

-- Step 23: Final status
SELECT 'COMPREHENSIVE FIX COMPLETE! All RLS policies using is_staff() have been recreated.' AS final_status;

