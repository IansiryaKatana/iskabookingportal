-- Remaining SECURITY DEFINER RPCs with no auth check were callable as
-- anon with only an application id (the 688-row dump already has those).
-- Staff UIs still work after MFA. Student payment pages still work for
-- the application's owner. Confirmation triggers still auto-apply
-- cashback / partner referral.

CREATE OR REPLACE FUNCTION public.require_owner_or_staff_mfa(
  p_application_id uuid,
  p_rpc text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Sign in is required'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_applications sa
    WHERE sa.id = p_application_id
      AND sa.student_id = v_uid
  ) THEN
    RETURN;
  END IF;

  IF public.is_privileged_portal_user() AND public.jwt_is_aal2() THEN
    RETURN;
  END IF;

  PERFORM public.raise_security_alert(
    'blocked_privileged_action',
    jsonb_build_object('rpc', p_rpc, 'reason', 'owner_or_staff_mfa_required')
  );
  RAISE EXCEPTION 'Forbidden: Staff MFA is required'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.require_owner_or_staff_mfa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_owner_or_staff_mfa(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Unguarded writes: cashback / discount / partner / manual payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_cashback_to_application(
  p_application_id uuid,
  p_campaign_id uuid,
  p_applied_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_campaign RECORD;
  v_cashback_id UUID;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    PERFORM public.require_staff_mfa('apply_cashback_to_application');
  END IF;

  IF NOT public.check_cashback_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this cashback campaign';
  END IF;

  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  INSERT INTO public.application_cashbacks (
    application_id,
    campaign_id,
    cashback_amount,
    applied_by
  ) VALUES (
    p_application_id,
    p_campaign_id,
    v_campaign.cashback_amount,
    p_applied_by
  )
  RETURNING id INTO v_cashback_id;

  UPDATE public.student_applications
  SET cashback_amount = v_campaign.cashback_amount
  WHERE id = p_application_id;

  UPDATE public.cashback_campaigns
  SET current_uses = current_uses + 1
  WHERE id = p_campaign_id;

  RETURN v_cashback_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_cashback_from_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cashback_record public.application_cashbacks%ROWTYPE;
  v_denormalized_amount NUMERIC;
BEGIN
  PERFORM public.require_staff_mfa('remove_cashback_from_application');

  SELECT *
  INTO v_cashback_record
  FROM public.application_cashbacks
  WHERE application_id = p_application_id
  ORDER BY applied_at DESC
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM public.application_cashbacks
    WHERE id = v_cashback_record.id;

    UPDATE public.cashback_campaigns
    SET current_uses = GREATEST(current_uses - 1, 0)
    WHERE id = v_cashback_record.campaign_id;
  END IF;

  SELECT COALESCE(cashback_amount, 0)
  INTO v_denormalized_amount
  FROM public.student_applications
  WHERE id = p_application_id;

  IF FOUND AND COALESCE(v_denormalized_amount, 0) > 0 THEN
    UPDATE public.student_applications
    SET cashback_amount = 0
    WHERE id = p_application_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_discount_from_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_discount_record public.application_discounts%ROWTYPE;
BEGIN
  PERFORM public.require_staff_mfa('remove_discount_from_application');

  SELECT *
  INTO v_discount_record
  FROM public.application_discounts
  WHERE application_id = p_application_id
  ORDER BY applied_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.application_discounts
  WHERE id = v_discount_record.id;

  UPDATE public.student_applications
  SET discount_amount = 0
  WHERE id = p_application_id;

  UPDATE public.discount_campaigns
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE id = v_discount_record.campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_partner_referral(
  p_application_id uuid,
  p_partner_id uuid,
  p_referral_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_partner RECORD;
  v_contract_value NUMERIC;
  v_commission_amount NUMERIC;
  v_referral_id UUID;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    PERFORM public.require_staff_mfa('create_partner_referral');
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found or inactive';
  END IF;

  v_contract_value := public.get_contract_value(p_application_id);
  v_commission_amount := v_contract_value * (v_partner.commission_percentage / 100);

  INSERT INTO public.partner_referrals (
    partner_id,
    application_id,
    referral_code,
    commission_percentage,
    total_contract_value,
    commission_amount
  ) VALUES (
    p_partner_id,
    p_application_id,
    p_referral_code,
    v_partner.commission_percentage,
    v_contract_value,
    v_commission_amount
  )
  RETURNING id INTO v_referral_id;

  UPDATE public.student_applications
  SET referred_by_partner_id = p_partner_id
  WHERE id = p_application_id;

  RETURN v_referral_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ota_amount_due(p_booking_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_gross NUMERIC := 0;
  v_commission NUMERIC := 0;
  v_expected_payout NUMERIC := 0;
BEGIN
  PERFORM public.require_staff_mfa('get_ota_amount_due');

  SELECT
    COALESCE(ob.price_per_night, 0) * COALESCE(ob.number_of_nights, 0),
    COALESCE(ob.commission_amount, 0),
    ob.total_revenue
  INTO v_gross, v_commission, v_expected_payout
  FROM public.ota_bookings ob
  WHERE ob.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_expected_payout IS NOT NULL THEN
    RETURN GREATEST(0, v_expected_payout);
  END IF;

  RETURN GREATEST(0, v_gross - v_commission);
END;
$$;

-- ---------------------------------------------------------------------------
-- Large functions: rename original, wrap with an auth gate
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.get_payment_summary(uuid)
  RENAME TO get_payment_summary_internal;

ALTER FUNCTION public.get_installment_breakdown(uuid)
  RENAME TO get_installment_breakdown_internal;

ALTER FUNCTION public.get_early_check_in_payment_summary(uuid)
  RENAME TO get_early_check_in_payment_summary_internal;

ALTER FUNCTION public.link_manual_payment_to_application_by_id(uuid, uuid, uuid)
  RENAME TO link_manual_payment_to_application_by_id_internal;

ALTER FUNCTION public.append_missing_contract_payment_schedule_rows(uuid, uuid)
  RENAME TO append_missing_contract_payment_schedule_rows_internal;

ALTER FUNCTION public.backfill_contract_payment_schedule_for_contract(uuid, uuid)
  RENAME TO backfill_contract_payment_schedule_for_contract_internal;

ALTER FUNCTION public.get_ota_payment_summary(uuid)
  RENAME TO get_ota_payment_summary_internal;

REVOKE ALL ON FUNCTION public.get_payment_summary_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_installment_breakdown_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_early_check_in_payment_summary_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_manual_payment_to_application_by_id_internal(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_missing_contract_payment_schedule_rows_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_contract_payment_schedule_for_contract_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ota_payment_summary_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_summary(p_application_id uuid)
RETURNS TABLE(
  total_due numeric,
  total_paid numeric,
  remaining_balance numeric,
  payment_count integer,
  last_payment_date timestamp with time zone,
  payment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_owner_or_staff_mfa(p_application_id, 'get_payment_summary');
  RETURN QUERY
  SELECT *
  FROM public.get_payment_summary_internal(p_application_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_installment_breakdown(p_application_id uuid)
RETURNS TABLE(
  installment_id uuid,
  sequence integer,
  label text,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  remaining_amount numeric,
  payment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_owner_or_staff_mfa(p_application_id, 'get_installment_breakdown');
  RETURN QUERY
  SELECT *
  FROM public.get_installment_breakdown_internal(p_application_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_early_check_in_payment_summary(p_application_id uuid)
RETURNS TABLE(
  early_check_in_id uuid,
  status text,
  early_check_in_date date,
  early_check_out_date date,
  nights integer,
  nightly_rate numeric,
  amount_due numeric,
  total_received numeric,
  remaining_balance numeric,
  payment_count integer,
  last_payment_date date,
  payment_status text,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_staff_mfa('get_early_check_in_payment_summary');
  RETURN QUERY
  SELECT *
  FROM public.get_early_check_in_payment_summary_internal(p_application_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_manual_payment_to_application_by_id(
  p_payment_id uuid,
  p_application_id uuid,
  p_instalment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_staff_mfa('link_manual_payment_to_application_by_id');
  RETURN public.link_manual_payment_to_application_by_id_internal(
    p_payment_id,
    p_application_id,
    p_instalment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_missing_contract_payment_schedule_rows(
  p_contract_id uuid,
  p_payment_plan_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    PERFORM public.require_staff_mfa('append_missing_contract_payment_schedule_rows');
  END IF;
  RETURN public.append_missing_contract_payment_schedule_rows_internal(
    p_contract_id,
    p_payment_plan_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_contract_payment_schedule_for_contract(
  p_contract_id uuid,
  p_payment_plan_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    PERFORM public.require_staff_mfa('backfill_contract_payment_schedule_for_contract');
  END IF;
  RETURN public.backfill_contract_payment_schedule_for_contract_internal(
    p_contract_id,
    p_payment_plan_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ota_payment_summary(p_booking_id uuid)
RETURNS TABLE(
  gross_booking_value numeric,
  amount_due numeric,
  total_received numeric,
  remaining_balance numeric,
  payment_count integer,
  last_payment_date date,
  payment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.require_staff_mfa('get_ota_payment_summary');
  RETURN QUERY
  SELECT *
  FROM public.get_ota_payment_summary_internal(p_booking_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Revoke anon from staff-only RPCs that already check is_staff()
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_cancel_early_check_in(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_early_check_in(uuid, date, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_early_check_in_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_early_checkout_student(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_record_early_check_in_payment(uuid, numeric, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_release_studio_occupancy(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_early_check_in_payment(uuid, numeric, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.amend_student_application_booking(uuid, date, integer, smallint, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_report_cash_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_users_with_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_website_admin_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_route(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_route_permissions_for_role(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_staff_subrole(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_partner_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trigger_release_expired_reservations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_expired_studio_holds() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_staff_activity(text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_staff_activity(text, text, uuid, jsonb, inet) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_cashback_to_application(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_cashback_from_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_discount_from_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_partner_referral(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ota_amount_due(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payment_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_installment_breakdown(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_early_check_in_payment_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_manual_payment_to_application_by_id(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.append_missing_contract_payment_schedule_rows(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.backfill_contract_payment_schedule_for_contract(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ota_payment_summary(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_cancel_early_check_in(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_early_check_in(uuid, date, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_early_check_in_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_early_checkout_student(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_early_check_in_payment(uuid, numeric, date, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_release_studio_occupancy(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_early_check_in_payment(uuid, numeric, date, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.amend_student_application_booking(uuid, date, integer, smallint, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_report_cash_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_users_with_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_website_admin_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_bulk_invitation_applications(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_route(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_route_permissions_for_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_subrole(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_release_expired_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_studio_holds() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_staff_activity(text, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_staff_activity(text, text, uuid, jsonb, inet) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_cashback_to_application(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_cashback_from_application(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_discount_from_application(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_partner_referral(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ota_amount_due(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_installment_breakdown(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_early_check_in_payment_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_manual_payment_to_application_by_id(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_missing_contract_payment_schedule_rows(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backfill_contract_payment_schedule_for_contract(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ota_payment_summary(uuid) TO authenticated, service_role;

-- Stolen Friday: this secret lets anyone POST send-security-alert as Ian.
UPDATE public.credentials
SET
  credential_value = encode(gen_random_bytes(32), 'hex'),
  updated_at = now()
WHERE lower(credential_key) = 'security_alert_webhook_secret';
