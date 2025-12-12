


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."application_status" AS ENUM (
    'draft',
    'awaiting_deposit',
    'awaiting_signature',
    'awaiting_verification',
    'confirmed',
    'cancelled',
    'expired'
);


ALTER TYPE "public"."application_status" OWNER TO "postgres";


CREATE TYPE "public"."document_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."document_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_amount_type" AS ENUM (
    'percentage',
    'fixed'
);


ALTER TYPE "public"."payment_amount_type" OWNER TO "postgres";


CREATE TYPE "public"."signature_type" AS ENUM (
    'student',
    'guarantor',
    'staff',
    'witness'
);


ALTER TYPE "public"."signature_type" OWNER TO "postgres";


CREATE TYPE "public"."studio_status" AS ENUM (
    'available',
    'reserved',
    'occupied',
    'maintenance'
);


ALTER TYPE "public"."studio_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_cashback_to_application"("p_application_id" "uuid", "p_campaign_id" "uuid", "p_applied_by" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_campaign RECORD;
  v_cashback_id UUID;
BEGIN
  -- Check eligibility
  IF NOT public.check_cashback_eligibility(p_application_id, p_campaign_id) THEN
    RAISE EXCEPTION 'Application does not qualify for this cashback campaign';
  END IF;

  -- Get campaign details
  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  -- Create application cashback record
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

  -- Update student_applications with cashback amount
  UPDATE public.student_applications
  SET cashback_amount = v_campaign.cashback_amount
  WHERE id = p_application_id;

  -- Increment campaign usage
  UPDATE public.cashback_campaigns
  SET current_uses = current_uses + 1
  WHERE id = p_campaign_id;

  RETURN v_cashback_id;
END;
$$;


ALTER FUNCTION "public"."apply_cashback_to_application"("p_application_id" "uuid", "p_campaign_id" "uuid", "p_applied_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_apply_cashback_on_confirmation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_campaign RECORD;
  v_applies_to TEXT;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Check if cashback already applied
    IF EXISTS (SELECT 1 FROM public.application_cashbacks WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Determine applies_to based on is_rebooking
    v_applies_to := CASE 
      WHEN COALESCE(NEW.is_rebooking, false) THEN 'rebooking'
      ELSE 'new'
    END;

    -- Find eligible active campaign
    SELECT * INTO v_campaign
    FROM public.cashback_campaigns
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
      AND (applies_to = 'all' OR applies_to = v_applies_to)
      AND (max_uses IS NULL OR current_uses < max_uses)
    ORDER BY created_at DESC
    LIMIT 1;

    -- Apply cashback if eligible campaign found
    IF FOUND THEN
      PERFORM public.apply_cashback_to_application(
        NEW.id,
        v_campaign.id,
        NULL -- System applied
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_apply_cashback_on_confirmation"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_apply_cashback_on_confirmation"() IS 'Automatically applies eligible cashback campaigns when application is confirmed';



CREATE OR REPLACE FUNCTION "public"."auto_create_partner_referral_on_confirmation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_referral_code TEXT;
  v_partner_id UUID;
BEGIN
  -- Only process when status changes to 'confirmed'
  IF NEW.status = 'confirmed' 
     AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    
    -- Check if referral already exists
    IF EXISTS (SELECT 1 FROM public.partner_referrals WHERE application_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Determine partner_id: use referred_by_partner_id if set, otherwise validate referral code
    IF NEW.referred_by_partner_id IS NOT NULL THEN
      v_partner_id := NEW.referred_by_partner_id;
      v_referral_code := NEW.validated_referral_code;
    ELSIF NEW.validated_referral_code IS NOT NULL THEN
      -- Look up partner by referral code
      SELECT id INTO v_partner_id
      FROM public.partners
      WHERE UPPER(TRIM(referral_code)) = UPPER(TRIM(NEW.validated_referral_code))
        AND is_active = true;
      
      IF v_partner_id IS NOT NULL THEN
        v_referral_code := NEW.validated_referral_code;
        -- Update referred_by_partner_id for consistency
        UPDATE public.student_applications
        SET referred_by_partner_id = v_partner_id
        WHERE id = NEW.id;
      END IF;
    END IF;

    -- Create partner referral if partner found
    IF v_partner_id IS NOT NULL THEN
      PERFORM public.create_partner_referral(
        NEW.id,
        v_partner_id,
        v_referral_code
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_partner_referral_on_confirmation"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_create_partner_referral_on_confirmation"() IS 'Automatically creates partner referral record when application with referred_by_partner_id is confirmed';



CREATE OR REPLACE FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.academic_years (
        name,
        start_date,
        end_date,
        is_active
      )
      VALUES (
        v_row->>'name',
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, false)
      )
      ON CONFLICT (name) DO UPDATE
      SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import academic years from JSONB array';



CREATE OR REPLACE FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_applies_to TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Normalize applies_to
      v_applies_to := LOWER(COALESCE(v_row->>'applies_to', 'all'));
      IF v_applies_to NOT IN ('all', 'new', 'rebooking') THEN
        v_applies_to := 'all';
      END IF;
      
      INSERT INTO public.cashback_campaigns (
        name,
        description,
        cashback_amount,
        applies_to,
        start_date,
        end_date,
        is_active,
        max_uses,
        current_uses,
        created_by
      )
      VALUES (
        v_row->>'name',
        NULLIF(v_row->>'description', ''),
        (v_row->>'cashback_amount')::NUMERIC(10,2),
        v_applies_to,
        (v_row->>'start_date')::DATE,
        (v_row->>'end_date')::DATE,
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        NULLIF(v_row->>'max_uses', '')::INTEGER,
        COALESCE((v_row->>'current_uses')::INTEGER, 0),
        p_imported_by
      )
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import cashback campaigns';



CREATE OR REPLACE FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_academic_year_id UUID;
  v_studio_grade_id UUID;
  v_payment_plan_id UUID;
  v_weeks INTEGER;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Look up studio grade
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      -- Look up payment plan (optional)
      IF v_row->>'payment_plan_name' IS NOT NULL AND v_row->>'payment_plan_name' != '' THEN
        SELECT id INTO v_payment_plan_id
        FROM public.payment_plans pp
        INNER JOIN public.academic_years ay ON pp.academic_year_id = ay.id
        WHERE pp.name = v_row->>'payment_plan_name'
          AND ay.name = v_row->>'academic_year_name';
      END IF;
      
      -- Calculate weeks if not provided
      IF v_row->>'weeks' IS NOT NULL AND v_row->>'weeks' != '' THEN
        v_weeks := (v_row->>'weeks')::INTEGER;
      ELSE
        -- Calculate from dates
        v_weeks := EXTRACT(EPOCH FROM ((v_row->>'contract_end')::DATE - (v_row->>'contract_start')::DATE)) / 604800;
      END IF;
      
      INSERT INTO public.contracts (
        slug,
        name,
        academic_year_id,
        studio_grade_id,
        payment_plan_id,
        contract_start,
        contract_end,
        weeks,
        weekly_price_override,
        deposit_override,
        summary,
        cta_label,
        display_order,
        is_active
      )
      VALUES (
        v_row->>'slug',
        v_row->>'name',
        v_academic_year_id,
        v_studio_grade_id,
        v_payment_plan_id,
        (v_row->>'contract_start')::DATE,
        (v_row->>'contract_end')::DATE,
        v_weeks,
        NULLIF(v_row->>'weekly_price_override', '')::NUMERIC(10,2),
        NULLIF(v_row->>'deposit_override', '')::NUMERIC(10,2),
        v_row->>'summary',
        COALESCE(v_row->>'cta_label', 'Enquire'),
        COALESCE((v_row->>'display_order')::INTEGER, 0),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        academic_year_id = EXCLUDED.academic_year_id,
        studio_grade_id = EXCLUDED.studio_grade_id,
        payment_plan_id = EXCLUDED.payment_plan_id,
        contract_start = EXCLUDED.contract_start,
        contract_end = EXCLUDED.contract_end,
        weeks = EXCLUDED.weeks,
        weekly_price_override = EXCLUDED.weekly_price_override,
        deposit_override = EXCLUDED.deposit_override,
        summary = EXCLUDED.summary,
        cta_label = EXCLUDED.cta_label,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import contracts (requires academic year, studio grade, optional payment plan)';



CREATE OR REPLACE FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.partners (
        name,
        contact_name,
        contact_email,
        contact_phone,
        commission_percentage,
        is_active,
        notes
      )
      VALUES (
        v_row->>'name',
        NULLIF(v_row->>'contact_name', ''),
        NULLIF(v_row->>'contact_email', ''),
        NULLIF(v_row->>'contact_phone', ''),
        COALESCE((v_row->>'commission_percentage')::NUMERIC(5,2), 5.00),
        COALESCE((v_row->>'is_active')::BOOLEAN, true),
        NULLIF(v_row->>'notes', '')
      )
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import partners (referral organizations)';



CREATE OR REPLACE FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_payment_plan_id UUID;
  v_academic_year_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up payment plan by name and academic year
      SELECT pp.id, pp.academic_year_id INTO v_payment_plan_id, v_academic_year_id
      FROM public.payment_plans pp
      INNER JOIN public.academic_years ay ON pp.academic_year_id = ay.id
      WHERE pp.name = v_row->>'payment_plan_name'
        AND ay.name = v_row->>'academic_year_name';
      
      IF v_payment_plan_id IS NULL THEN
        RAISE EXCEPTION 'Payment plan "%" not found for academic year "%"', 
          v_row->>'payment_plan_name', v_row->>'academic_year_name';
      END IF;
      
      INSERT INTO public.payment_plan_installments (
        payment_plan_id,
        sequence,
        label,
        due_date_offset_days,
        due_date,
        amount_type,
        amount_value
      )
      VALUES (
        v_payment_plan_id,
        (v_row->>'sequence')::SMALLINT,
        v_row->>'label',
        NULLIF(v_row->>'due_date_offset_days', '')::INTEGER,
        NULLIF(v_row->>'due_date', '')::DATE,
        COALESCE(v_row->>'amount_type', 'percentage')::public.payment_amount_type,
        (v_row->>'amount_value')::NUMERIC(10,2)
      )
      ON CONFLICT (payment_plan_id, sequence) DO UPDATE
      SET
        label = EXCLUDED.label,
        due_date_offset_days = EXCLUDED.due_date_offset_days,
        due_date = EXCLUDED.due_date,
        amount_type = EXCLUDED.amount_type,
        amount_value = EXCLUDED.amount_value,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import payment plan installments';



CREATE OR REPLACE FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_academic_year_id UUID;
  v_existing_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year by name
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Check if payment plan already exists for this academic year
      SELECT id INTO v_existing_id
      FROM public.payment_plans
      WHERE academic_year_id = v_academic_year_id
        AND name = v_row->>'name';
      
      IF v_existing_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.payment_plans
        SET
          description = v_row->>'description',
          deposit_amount = NULLIF(v_row->>'deposit_amount', '')::NUMERIC(10,2),
          is_active = COALESCE((v_row->>'is_active')::BOOLEAN, true),
          updated_at = NOW()
        WHERE id = v_existing_id;
        v_record_id := v_existing_id;
      ELSE
        -- Insert new
        INSERT INTO public.payment_plans (
          academic_year_id,
          name,
          description,
          deposit_amount,
          is_active
        )
        VALUES (
          v_academic_year_id,
          v_row->>'name',
          v_row->>'description',
          NULLIF(v_row->>'deposit_amount', '')::NUMERIC(10,2),
          COALESCE((v_row->>'is_active')::BOOLEAN, true)
        )
        RETURNING id INTO v_record_id;
      END IF;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import payment plans per academic year';



CREATE OR REPLACE FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  
  -- User fields
  v_student_id UUID;
  v_email TEXT;
  v_user_exists BOOLEAN;
  
  -- Application fields
  v_contract_id UUID;
  v_studio_grade_id UUID;
  v_studio_id UUID;
  v_status TEXT;
  v_submitted_at TIMESTAMPTZ;
  
  -- Step payloads
  v_step1_payload JSONB;
  v_step2_payload JSONB;
  v_step3_payload JSONB;
  v_step4_payload JSONB;
  v_step5_payload JSONB;
  v_step6_payload JSONB;
  
  -- Documents
  v_passport_path TEXT;
  v_visa_path TEXT;
  v_utility_bill_path TEXT;
  v_id_document_path TEXT;
  v_bank_statement_path TEXT;
  v_contract_pdf_path TEXT;
  
  -- Other fields
  v_referral_code TEXT;
  v_payment_plan_id UUID;
  v_deposit_amount NUMERIC;
  v_deposit_paid_date DATE;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Extract email and check if user exists
      -- Note: User creation must happen in Edge Function via Admin API
      -- This function expects student_id to be provided or user to already exist
      v_email := LOWER(TRIM(v_row->>'email'));
      
      IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email is required for application import';
      END IF;
      
      -- Try to find existing user
      SELECT id INTO v_student_id FROM auth.users WHERE email = v_email LIMIT 1;
      
      IF v_student_id IS NULL THEN
        -- User doesn't exist - will be created by Edge Function
        -- For now, we'll return an error indicating user needs to be created
        -- Edge Function should create user first, then call this function again
        RAISE EXCEPTION 'User with email % does not exist. User must be created first via Edge Function.', v_email;
      END IF;
      
      -- Validate and get contract
      SELECT c.id, c.studio_grade_id INTO v_contract_id, v_studio_grade_id
      FROM public.contracts c
      WHERE c.slug = v_row->>'contract_slug'
      LIMIT 1;
      
      IF v_contract_id IS NULL THEN
        RAISE EXCEPTION 'Contract with slug % not found', v_row->>'contract_slug';
      END IF;
      
      -- Get studio if provided
      IF v_row->>'studio_number' IS NOT NULL AND v_row->>'studio_number' != '' THEN
        SELECT s.id INTO v_studio_id
        FROM public.studios s
        WHERE s.studio_number = v_row->>'studio_number'
        LIMIT 1;
        
        IF v_studio_id IS NULL THEN
          RAISE EXCEPTION 'Studio with number % not found', v_row->>'studio_number';
        END IF;
      END IF;
      
      -- Get payment plan if provided
      IF v_row->>'payment_plan_name' IS NOT NULL AND v_row->>'payment_plan_name' != '' THEN
        -- First try direct lookup via contract's academic year
        SELECT pp.id INTO v_payment_plan_id
        FROM public.payment_plans pp
        INNER JOIN public.contracts c ON c.academic_year_id = pp.academic_year_id
        WHERE pp.name = v_row->>'payment_plan_name'
        AND c.id = v_contract_id
        LIMIT 1;
        
        -- If not found, check contract_payment_plans junction table
        IF v_payment_plan_id IS NULL THEN
          SELECT cpp.payment_plan_id INTO v_payment_plan_id
          FROM public.contract_payment_plans cpp
          INNER JOIN public.payment_plans pp ON pp.id = cpp.payment_plan_id
          WHERE cpp.contract_id = v_contract_id
            AND pp.name = v_row->>'payment_plan_name'
          LIMIT 1;
        END IF;
      END IF;
      
      -- Determine status
      v_status := COALESCE(
        NULLIF(TRIM(v_row->>'status'), ''),
        'confirmed' -- Default for historical imports
      );
      
      -- Parse dates
      IF v_row->>'submitted_at' IS NOT NULL AND v_row->>'submitted_at' != '' THEN
        v_submitted_at := (v_row->>'submitted_at')::TIMESTAMPTZ;
      END IF;
      
      -- Build step payloads
      -- Step 1: Personal Details
      -- Auto-calculate age from date_of_birth if age not provided
      v_step1_payload := jsonb_build_object(
        'first_name', NULLIF(TRIM(v_row->>'first_name'), ''),
        'last_name', NULLIF(TRIM(v_row->>'last_name'), ''),
        'date_of_birth', NULLIF(TRIM(v_row->>'date_of_birth'), ''),
        'age', CASE 
          WHEN v_row->>'age' IS NOT NULL AND v_row->>'age' != '' 
            THEN v_row->>'age'
          WHEN v_row->>'date_of_birth' IS NOT NULL AND v_row->>'date_of_birth' != '' 
            THEN EXTRACT(YEAR FROM AGE((v_row->>'date_of_birth')::DATE))::TEXT
          ELSE NULL
        END,
        'ethnicity', NULLIF(TRIM(v_row->>'ethnicity'), ''),
        'gender', NULLIF(TRIM(v_row->>'gender'), ''),
        'ucas_id', NULLIF(TRIM(v_row->>'ucas_id'), ''),
        'country', NULLIF(TRIM(v_row->>'country'), ''),
        'referral_code', NULLIF(TRIM(v_row->>'referral_code'), '')
      );
      
      -- Step 2: Contact Information
      v_step2_payload := jsonb_build_object(
        'email', v_email,
        'mobile', NULLIF(TRIM(v_row->>'mobile'), ''),
        'address_line_1', NULLIF(TRIM(v_row->>'address_line_1'), ''),
        'address_line_2', NULLIF(TRIM(v_row->>'address_line_2'), ''),
        'postcode', NULLIF(TRIM(v_row->>'postcode'), ''),
        'town', NULLIF(TRIM(v_row->>'town'), '')
      );
      
      -- Step 3: Academic & Additional Info
      v_step3_payload := jsonb_build_object(
        'year_of_study', NULLIF(TRIM(v_row->>'year_of_study'), ''),
        'field_of_study', NULLIF(TRIM(v_row->>'field_of_study'), ''),
        'disabled', NULLIF(TRIM(v_row->>'disabled'), ''),
        'smoker', NULLIF(TRIM(v_row->>'smoker'), ''),
        'medical_requirements', NULLIF(TRIM(v_row->>'medical_requirements'), ''),
        'entry_into_uk', NULLIF(TRIM(v_row->>'entry_into_uk'), '')
      );
      
      -- Step 4: Documentation
      v_passport_path := NULLIF(TRIM(v_row->>'passport_path'), '');
      v_visa_path := NULLIF(TRIM(v_row->>'visa_path'), '');
      
      v_step4_payload := jsonb_build_object(
        'uk_citizen', COALESCE(NULLIF(TRIM(v_row->>'uk_citizen'), ''), 'yes'),
        'passport_document', v_passport_path,
        'visa_document', v_visa_path
      );
      
      -- Step 5: Payment Plan & Guarantor
      v_utility_bill_path := NULLIF(TRIM(v_row->>'utility_bill_path'), '');
      v_id_document_path := NULLIF(TRIM(v_row->>'id_document_path'), '');
      v_bank_statement_path := NULLIF(TRIM(v_row->>'bank_statement_path'), '');
      
      v_step5_payload := jsonb_build_object(
        'selected_plan_id', CASE WHEN v_payment_plan_id IS NOT NULL THEN v_payment_plan_id::TEXT ELSE NULL END,
        'guarantor_name', NULLIF(TRIM(v_row->>'guarantor_name'), ''),
        'guarantor_email', NULLIF(TRIM(v_row->>'guarantor_email'), ''),
        'guarantor_phone', NULLIF(TRIM(v_row->>'guarantor_phone'), ''),
        'guarantor_relationship', NULLIF(TRIM(v_row->>'guarantor_relationship'), ''),
        'guarantor_dob', NULLIF(TRIM(v_row->>'guarantor_dob'), ''),
        'witness_name', NULLIF(TRIM(v_row->>'witness_name'), ''),
        'witness_email', NULLIF(TRIM(v_row->>'witness_email'), ''),
        'witness_phone', NULLIF(TRIM(v_row->>'witness_phone'), ''),
        'utility_bill', v_utility_bill_path,
        'id_document', v_id_document_path,
        'bank_statement', v_bank_statement_path,
        'consent', COALESCE((v_row->>'consent')::BOOLEAN, true)
      );
      
      -- Step 6: Agreement & Signing (minimal for historical)
      v_contract_pdf_path := NULLIF(TRIM(v_row->>'contract_pdf_path'), '');
      
      v_step6_payload := jsonb_build_object(
        'contract_signed', CASE WHEN v_contract_pdf_path IS NOT NULL THEN true ELSE false END,
        'contract_pdf_path', v_contract_pdf_path
      );
      
      -- Create application
      INSERT INTO public.student_applications (
        student_id,
        studio_grade_id,
        contract_id,
        assigned_studio_id,
        status,
        submitted_at,
        reserved_studio_expires_at,
        selected_payment_plan_id
      )
      VALUES (
        v_student_id,
        v_studio_grade_id,
        v_contract_id,
        v_studio_id,
        v_status::public.application_status,
        COALESCE(v_submitted_at, NOW()),
        NULL, -- No reservation expiry for historical imports
        v_payment_plan_id
      )
      RETURNING id INTO v_record_id;
      
      -- Create application steps
      INSERT INTO public.student_application_steps (application_id, step_number, payload, is_complete)
      VALUES
        (v_record_id, 1, v_step1_payload, true),
        (v_record_id, 2, v_step2_payload, true),
        (v_record_id, 3, v_step3_payload, true),
        (v_record_id, 4, v_step4_payload, true),
        (v_record_id, 5, v_step5_payload, true),
        (v_record_id, 6, v_step6_payload, v_status = 'confirmed')
      ON CONFLICT (application_id, step_number) DO UPDATE
      SET
        payload = EXCLUDED.payload,
        is_complete = EXCLUDED.is_complete,
        updated_at = NOW();
      
      -- Create document records
      IF v_passport_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'passport',
          v_passport_path,
          (regexp_split_to_array(v_passport_path, '/'))[array_length(regexp_split_to_array(v_passport_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_visa_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'visa',
          v_visa_path,
          (regexp_split_to_array(v_visa_path, '/'))[array_length(regexp_split_to_array(v_visa_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_utility_bill_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'utility_bill',
          v_utility_bill_path,
          (regexp_split_to_array(v_utility_bill_path, '/'))[array_length(regexp_split_to_array(v_utility_bill_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_id_document_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'id_document',
          v_id_document_path,
          (regexp_split_to_array(v_id_document_path, '/'))[array_length(regexp_split_to_array(v_id_document_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF v_bank_statement_path IS NOT NULL THEN
        INSERT INTO public.student_documents (
          application_id,
          document_type,
          storage_path,
          original_filename,
          status,
          uploaded_by,
          verified_by,
          uploaded_at
        )
        VALUES (
          v_record_id,
          'bank_statement',
          v_bank_statement_path,
          (regexp_split_to_array(v_bank_statement_path, '/'))[array_length(regexp_split_to_array(v_bank_statement_path, '/'), 1)],
          'approved',
          p_imported_by,
          p_imported_by,
          COALESCE(v_submitted_at, NOW())
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      -- Handle deposit payment if provided
      v_deposit_amount := NULLIF((v_row->>'deposit_amount')::NUMERIC, NULL);
      v_deposit_paid_date := NULLIF((v_row->>'deposit_paid_date')::DATE, NULL);
      
      IF v_deposit_amount IS NOT NULL AND v_deposit_amount > 0 THEN
        INSERT INTO public.manual_payments (
          application_id,
          amount,
          payment_date,
          payment_type,
          payment_method,
          notes,
          recorded_by
        )
        VALUES (
          v_record_id,
          v_deposit_amount,
          COALESCE(v_deposit_paid_date, v_submitted_at::DATE, CURRENT_DATE),
          'deposit',
          'bank_transfer', -- Default payment method for historical imports
          'Historical deposit payment (imported)',
          p_imported_by
        )
        ON CONFLICT DO NOTHING;
        
        -- Update application deposit_payment_intent_id
        UPDATE public.student_applications
        SET deposit_payment_intent_id = 'manual-' || v_record_id::TEXT
        WHERE id = v_record_id;
      END IF;
      
      -- Handle partner referral if provided
      v_referral_code := NULLIF(TRIM(v_row->>'referral_code'), '');
      
      IF v_referral_code IS NOT NULL THEN
        INSERT INTO public.partner_referrals (
          partner_id,
          application_id,
          referral_code,
          commission_percentage,
          created_at
        )
        SELECT
          p.id,
          v_record_id,
          v_referral_code,
          p.commission_percentage,
          COALESCE(v_submitted_at, NOW())
        FROM public.partners p
        WHERE p.referral_code = v_referral_code
        LIMIT 1
        ON CONFLICT DO NOTHING;
      END IF;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
      
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import student applications with all steps, documents, and related data. 
Note: Users must be created via Edge Function Admin API before calling this function.';



CREATE OR REPLACE FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_academic_year_id UUID;
  v_studio_grade_id UUID;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up academic year by name
      SELECT id INTO v_academic_year_id
      FROM public.academic_years
      WHERE name = v_row->>'academic_year_name';
      
      IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Academic year "%" not found', v_row->>'academic_year_name';
      END IF;
      
      -- Look up studio grade by slug
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      INSERT INTO public.studio_grade_prices (
        academic_year_id,
        studio_grade_id,
        weekly_price,
        deposit_amount_override,
        currency_code,
        is_active
      )
      VALUES (
        v_academic_year_id,
        v_studio_grade_id,
        (v_row->>'weekly_price')::NUMERIC(10,2),
        NULLIF(v_row->>'deposit_amount_override', '')::NUMERIC(10,2),
        COALESCE(v_row->>'currency_code', 'GBP'),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (academic_year_id, studio_grade_id) DO UPDATE
      SET
        weekly_price = EXCLUDED.weekly_price,
        deposit_amount_override = EXCLUDED.deposit_amount_override,
        currency_code = EXCLUDED.currency_code,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import studio grade prices per academic year';



CREATE OR REPLACE FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      INSERT INTO public.studio_grades (
        slug,
        name,
        short_description,
        long_description,
        max_occupancy,
        display_order,
        is_active
      )
      VALUES (
        v_row->>'slug',
        v_row->>'name',
        v_row->>'short_description',
        v_row->>'long_description',
        COALESCE((v_row->>'max_occupancy')::INTEGER, 1),
        COALESCE((v_row->>'display_order')::INTEGER, 0),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        short_description = EXCLUDED.short_description,
        long_description = EXCLUDED.long_description,
        max_occupancy = EXCLUDED.max_occupancy,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import studio grades from JSONB array';



CREATE OR REPLACE FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") RETURNS TABLE("row_number" integer, "status" "text", "record_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row JSONB;
  v_row_num INTEGER := 0;
  v_record_id UUID;
  v_error TEXT;
  v_studio_grade_id UUID;
  v_status TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_row_num := v_row_num + 1;
    BEGIN
      -- Look up studio grade by slug
      SELECT id INTO v_studio_grade_id
      FROM public.studio_grades
      WHERE slug = v_row->>'studio_grade_slug';
      
      IF v_studio_grade_id IS NULL THEN
        RAISE EXCEPTION 'Studio grade with slug "%" not found', v_row->>'studio_grade_slug';
      END IF;
      
      -- Normalize status
      v_status := LOWER(COALESCE(v_row->>'status', 'available'));
      IF v_status NOT IN ('available', 'reserved', 'occupied', 'maintenance') THEN
        v_status := 'available';
      END IF;
      
      INSERT INTO public.studios (
        studio_number,
        studio_grade_id,
        floor,
        status,
        allocation,
        is_active
      )
      VALUES (
        v_row->>'studio_number',
        v_studio_grade_id,
        v_row->>'floor',
        v_status::public.studio_status,
        NULLIF(v_row->>'allocation', ''),
        COALESCE((v_row->>'is_active')::BOOLEAN, true)
      )
      ON CONFLICT (studio_number) DO UPDATE
      SET
        studio_grade_id = EXCLUDED.studio_grade_id,
        floor = EXCLUDED.floor,
        status = EXCLUDED.status,
        allocation = EXCLUDED.allocation,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id INTO v_record_id;
      
      RETURN QUERY SELECT v_row_num, 'success'::TEXT, v_record_id, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_row_num, 'error'::TEXT, NULL::UUID, v_error;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") IS 'Bulk import studios from JSONB array (requires studio grade slugs)';



CREATE OR REPLACE FUNCTION "public"."calculate_contract_value"("p_contract_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_weekly_price NUMERIC(10,2);
  v_weeks INTEGER;
BEGIN
  SELECT 
    COALESCE(c.weekly_price_override, sgp.weekly_price),
    c.weeks
  INTO v_weekly_price, v_weeks
  FROM public.contracts c
  JOIN public.studio_grade_prices sgp 
    ON c.studio_grade_id = sgp.studio_grade_id 
    AND c.academic_year_id = sgp.academic_year_id
  WHERE c.id = p_contract_id;
  
  RETURN COALESCE(v_weekly_price * v_weeks, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_contract_value"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_partner_commission"("p_application_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_commission NUMERIC;
BEGIN
  SELECT 
    pr.total_contract_value * (pr.commission_percentage / 100)
  INTO v_commission
  FROM public.partner_referrals pr
  WHERE pr.application_id = p_application_id;

  RETURN COALESCE(v_commission, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_partner_commission"("p_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_route"("p_route_path" "text", "p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- If no permission record exists, default to false (strict mode)
  -- You can change this to true if you want permissive mode
  SELECT COALESCE(
    (SELECT allowed FROM public.route_permissions 
     WHERE route_path = p_route_path AND role = p_role),
    false
  );
$$;


ALTER FUNCTION "public"."can_access_route"("p_route_path" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_student_rebook"("p_user_id" "uuid", "p_contract_id" "uuid") RETURNS TABLE("can_rebook" boolean, "previous_application_id" "uuid", "previous_contract_name" "text", "previous_academic_year" "text", "message" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_previous_app UUID;
  v_contract_name TEXT;
  v_academic_year TEXT;
  v_message TEXT;
BEGIN
  -- Find most recent confirmed application for this student
  SELECT 
    sa.id,
    c.name,
    ay.name
  INTO v_previous_app, v_contract_name, v_academic_year
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  INNER JOIN public.academic_years ay ON c.academic_year_id = ay.id
  WHERE sa.student_id = p_user_id  -- Fixed: was user_id, should be student_id
    AND sa.status = 'confirmed'
  ORDER BY sa.created_at DESC
  LIMIT 1;

  -- Check if there's already a rebooking for this contract
  IF EXISTS (
    SELECT 1
    FROM public.student_applications
    WHERE student_id = p_user_id  -- Fixed: was user_id, should be student_id
      AND contract_id = p_contract_id
      AND is_rebooking = true
      AND status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
  ) THEN
    RETURN QUERY SELECT 
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'You already have a rebooking application for this contract'::TEXT;
    RETURN;
  END IF;

  -- If no previous application, they can still apply (first time)
  IF v_previous_app IS NULL THEN
    RETURN QUERY SELECT 
      true,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'First-time application'::TEXT;
    RETURN;
  END IF;

  -- Check if the contract is for a future academic year
  DECLARE
    v_current_contract_year_id UUID;
    v_new_contract_year_id UUID;
    v_current_year_start DATE;
    v_new_year_start DATE;
  BEGIN
    SELECT academic_year_id INTO v_current_contract_year_id
    FROM public.contracts
    WHERE id = (
      SELECT contract_id
      FROM public.student_applications
      WHERE id = v_previous_app
    );

    SELECT academic_year_id INTO v_new_contract_year_id
    FROM public.contracts
    WHERE id = p_contract_id;

    -- Get academic year start dates
    SELECT start_date INTO v_current_year_start
    FROM public.academic_years
    WHERE id = v_current_contract_year_id;

    SELECT start_date INTO v_new_year_start
    FROM public.academic_years
    WHERE id = v_new_contract_year_id;

    -- If new contract is for a future year, allow rebooking
    IF v_new_year_start > v_current_year_start THEN
      RETURN QUERY SELECT 
        true,
        v_previous_app,
        v_contract_name,
        v_academic_year,
        format('You can rebook for %s. Your previous application from %s will be used to pre-fill this form.'::TEXT, 
          (SELECT name FROM public.academic_years WHERE id = v_new_contract_year_id),
          v_academic_year);
      RETURN;
    END IF;

    -- If same year or past year, check if there's a gap
    -- Allow rebooking if there's at least one academic year gap
    IF v_new_year_start > v_current_year_start + INTERVAL '1 year' THEN
      RETURN QUERY SELECT 
        true,
        v_previous_app,
        v_contract_name,
        v_academic_year,
        format('You can rebook after a gap. Your previous application from %s will be used to pre-fill this form.'::TEXT, 
          v_academic_year);
      RETURN;
    END IF;
  END;

  -- Default: cannot rebook (same year or other restriction)
  RETURN QUERY SELECT 
    false,
    v_previous_app,
    v_contract_name,
    v_academic_year,
    format('You already have a confirmed application for %s. Rebooking is only available for future academic years or after a gap.'::TEXT, 
      v_academic_year);
END;
$$;


ALTER FUNCTION "public"."can_student_rebook"("p_user_id" "uuid", "p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_cashback_eligibility"("p_application_id" "uuid", "p_campaign_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_campaign RECORD;
  v_application RECORD;
  v_is_eligible BOOLEAN := false;
BEGIN
  -- Get campaign details
  SELECT * INTO v_campaign
  FROM public.cashback_campaigns
  WHERE id = p_campaign_id;

  -- Check if campaign exists and is active
  IF NOT FOUND OR NOT v_campaign.is_active THEN
    RETURN false;
  END IF;

  -- Check dates
  IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
    RETURN false;
  END IF;

  -- Check max uses
  IF v_campaign.max_uses IS NOT NULL AND v_campaign.current_uses >= v_campaign.max_uses THEN
    RETURN false;
  END IF;

  -- Get application details
  SELECT * INTO v_application
  FROM public.student_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check applies_to criteria
  IF v_campaign.applies_to = 'all' THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'new' AND NOT COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  ELSIF v_campaign.applies_to = 'rebooking' AND COALESCE(v_application.is_rebooking, false) THEN
    v_is_eligible := true;
  END IF;

  -- Check if cashback already applied to this application
  IF EXISTS (
    SELECT 1 FROM public.application_cashbacks
    WHERE application_id = p_application_id
  ) THEN
    v_is_eligible := false;
  END IF;

  RETURN v_is_eligible;
END;
$$;


ALTER FUNCTION "public"."check_cashback_eligibility"("p_application_id" "uuid", "p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") RETURNS TABLE("is_available" boolean, "partner_id" "uuid", "partner_name" "text", "is_already_linked" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_partner_id UUID;
  v_partner_name TEXT;
  v_is_linked BOOLEAN;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id, name INTO v_partner_id, v_partner_name
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true;
  
  IF v_partner_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;
  
  -- Check if already linked
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE partner_id = v_partner_id
  ) INTO v_is_linked;
  
  RETURN QUERY SELECT 
    NOT v_is_linked AS is_available,
    v_partner_id,
    v_partner_name,
    v_is_linked;
END;
$$;


ALTER FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") IS 'Checks if a referral code is available (not already linked to another account). 
Uses SECURITY DEFINER to bypass RLS so users can check codes without direct access to partners table.';



CREATE OR REPLACE FUNCTION "public"."create_partner_referral"("p_application_id" "uuid", "p_partner_id" "uuid", "p_referral_code" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_partner RECORD;
  v_contract_value NUMERIC;
  v_commission_amount NUMERIC;
  v_referral_id UUID;
BEGIN
  -- Get partner details
  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found or inactive';
  END IF;

  -- Calculate contract value
  v_contract_value := public.get_contract_value(p_application_id);

  -- Calculate commission
  v_commission_amount := v_contract_value * (v_partner.commission_percentage / 100);

  -- Create partner referral record
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

  -- Update student_applications with partner reference
  UPDATE public.student_applications
  SET referred_by_partner_id = p_partner_id
  WHERE id = p_application_id;

  RETURN v_referral_id;
END;
$$;


ALTER FUNCTION "public"."create_partner_referral"("p_application_id" "uuid", "p_partner_id" "uuid", "p_referral_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_payment_summary"("p_application_id" "uuid") RETURNS TABLE("debug_info" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total_due NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_debug JSONB;
  v_payments JSONB;
BEGIN
  -- Get total due
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  -- Get all payments from unified history
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'payment_id', payment_id,
        'amount_paid', amount_paid,
        'payment_status', payment_status,
        'payment_source', payment_source,
        'installment_number', installment_number,
        'payment_metadata', payment_metadata,
        'payment_metadata_type', payment_metadata->>'type',
        'is_instalment', (
          payment_metadata->>'type' = 'instalment' 
          OR installment_number IS NOT NULL
        ),
        'is_deposit', payment_metadata->>'type' = 'deposit'
      )
    ),
    COALESCE(SUM(amount_paid), 0),
    COUNT(*)
  INTO v_payments, v_total_paid, v_payment_count
  FROM public.unified_payment_history
  WHERE student_application_id = p_application_id
    AND payment_status IN ('succeeded', 'completed');

  -- Get installment payments only
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO v_total_paid
  FROM public.unified_payment_history
  WHERE student_application_id = p_application_id
    AND payment_status IN ('succeeded', 'completed')
    AND (
      payment_metadata->>'type' = 'instalment'
      OR installment_number IS NOT NULL
    )
    AND COALESCE(payment_metadata->>'type', '') != 'deposit';

  v_debug := jsonb_build_object(
    'application_id', p_application_id,
    'total_due', v_total_due,
    'total_paid_installments', v_total_paid,
    'payment_count', v_payment_count,
    'remaining_balance', GREATEST(v_total_due - v_total_paid, 0),
    'all_payments', v_payments
  );

  RETURN QUERY SELECT v_debug;
END;
$$;


ALTER FUNCTION "public"."debug_payment_summary"("p_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_application_id UUID;
  v_student_id UUID;
  v_total_deleted INTEGER := 0;
  v_users_deleted INTEGER := 0;
  v_users_preserved INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_user_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  v_student_ids_from_apps UUID[] := '{}';
BEGIN
  -- Disable RLS for this function
  PERFORM set_config('row_security', 'off', true);
  
  -- Count total applications first
  SELECT COUNT(*) INTO v_total_applications 
  FROM public.student_applications;
  
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
      'message', 'No applications found to delete'
    );
  END IF;
  
  -- Step 1: Delete all applications and collect student_ids
  FOR v_application_id IN 
    SELECT id 
    FROM public.student_applications
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Get student_id before deletion
      SELECT student_id INTO v_student_id
      FROM public.student_applications
      WHERE id = v_application_id;
      
      -- Add to collection if not already present
      IF v_student_id IS NOT NULL AND NOT (v_student_id = ANY(v_student_ids_from_apps)) THEN
        v_student_ids_from_apps := v_student_ids_from_apps || v_student_id;
      END IF;
      
      -- Call the delete function
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'student_id', v_student_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled)
  IF p_delete_orphaned_users THEN
    -- Process each unique student_id
    FOREACH v_student_id IN ARRAY v_student_ids_from_apps
    LOOP
      -- Skip if already processed
      IF v_student_id = ANY(v_deleted_user_ids) OR v_student_id = ANY(v_preserved_user_ids) THEN
        CONTINUE;
      END IF;
      
      -- Initialize preservation check
      v_should_preserve := false;
      v_preservation_reason := '';
      v_user_role := NULL;
      v_has_remaining_apps := false;
      v_has_refunds := false;
      v_has_maintenance := false;
      v_has_utility_payments := false;
      v_has_activity_logs := false;
      
      -- Rule 1: Check if user is staff/superadmin
      SELECT role INTO v_user_role
      FROM public.profiles
      WHERE id = v_student_id;
      
      IF v_user_role IN ('staff', 'superadmin') THEN
        v_should_preserve := true;
        v_preservation_reason := 'User is staff/superadmin';
      END IF;
      
      -- Rule 2: Check for remaining applications
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_remaining_apps
        FROM public.student_applications
        WHERE student_id = v_student_id;
        
        IF v_has_remaining_apps THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has remaining applications';
        END IF;
      END IF;
      
      -- Rule 3: Check for refunds
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_refunds
        FROM public.refunds
        WHERE student_id = v_student_id;
        
        IF v_has_refunds THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has refund records (accounting requirement)';
        END IF;
      END IF;
      
      -- Rule 4: Check for maintenance requests
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_maintenance
        FROM public.maintenance_requests
        WHERE student_id = v_student_id;
        
        IF v_has_maintenance THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has maintenance request history';
        END IF;
      END IF;
      
      -- Rule 5: Check for utility payments created by user
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_utility_payments
        FROM public.utility_payments
        WHERE created_by = v_student_id;
        
        IF v_has_utility_payments THEN
          v_should_preserve := true;
          v_preservation_reason := 'User created utility payment records (financial audit)';
        END IF;
      END IF;
      
      -- Rule 6: Check for activity logs
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_activity_logs
        FROM public.staff_activity_logs
        WHERE staff_id = v_student_id;
        
        IF v_has_activity_logs THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has activity log entries (audit trail)';
        END IF;
      END IF;
      
      -- Decision: Delete or Preserve
      IF v_should_preserve THEN
        v_users_preserved := v_users_preserved + 1;
        v_preserved_user_ids := v_preserved_user_ids || v_student_id;
        v_user_details := v_user_details || jsonb_build_object(
          'user_id', v_student_id,
          'action', 'preserved',
          'reason', v_preservation_reason,
          'has_remaining_apps', v_has_remaining_apps,
          'has_refunds', v_has_refunds,
          'has_maintenance', v_has_maintenance,
          'has_utility_payments', v_has_utility_payments,
          'has_activity_logs', v_has_activity_logs,
          'role', v_user_role
        );
      ELSE
        -- Safe to delete - user has no important data
        BEGIN
          -- Delete from auth.users (will cascade to profiles, notifications, etc.)
          DELETE FROM auth.users WHERE id = v_student_id;
          
          v_users_deleted := v_users_deleted + 1;
          v_deleted_user_ids := v_deleted_user_ids || v_student_id;
          v_user_details := v_user_details || jsonb_build_object(
            'user_id', v_student_id,
            'action', 'deleted',
            'reason', 'No important data found - safe to delete',
            'has_remaining_apps', false,
            'has_refunds', false,
            'has_maintenance', false,
            'has_utility_payments', false,
            'has_activity_logs', false
          );
        EXCEPTION
          WHEN OTHERS THEN
            -- Deletion failed (e.g., RESTRICT constraint)
            v_users_preserved := v_users_preserved + 1;
            v_preserved_user_ids := v_preserved_user_ids || v_student_id;
            v_user_details := v_user_details || jsonb_build_object(
              'user_id', v_student_id,
              'action', 'preserved',
              'reason', 'Deletion blocked: ' || SQLERRM,
              'error', SQLERRM,
              'error_code', SQLSTATE
            );
        END;
      END IF;
    END LOOP;
  END IF;
  
  -- Cleanup orphaned studio allocations
  UPDATE public.studios
  SET 
    allocation = NULL,
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' THEN 'available'
      ELSE status
    END
  WHERE 
    allocation IS NOT NULL
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- Clear all expired reservations
  UPDATE public.studios
  SET 
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available'
      ELSE status
    END
  WHERE 
    reservation_expires_at IS NOT NULL
    AND reservation_expires_at < NOW();
  
  -- Reset any studios that are still marked as reserved but have no allocation
  UPDATE public.studios
  SET 
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE 
    status = 'reserved'
    AND (allocation IS NULL OR allocation = '');
  
  -- Return comprehensive result
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'users_deleted', v_users_deleted,
    'users_preserved', v_users_preserved,
    'details', v_details,
    'user_details', v_user_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s applications. Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$_$;


ALTER FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean) IS 'Deletes all student applications. If p_delete_orphaned_users is true, intelligently deletes orphaned user accounts that have no important data (refunds, maintenance requests, etc.). Staff accounts are never deleted.';



CREATE OR REPLACE FUNCTION "public"."delete_student_application"("p_application_id" "uuid") RETURNS TABLE("deleted_tables" "jsonb", "total_deleted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_deleted_count INTEGER := 0;
  v_deleted_tables JSONB := '{}'::JSONB;
  v_studio_id UUID;
BEGIN
  -- Disable RLS for this function to ensure we can access all records
  -- Using set_config with local=true ensures it only affects this transaction
  PERFORM set_config('row_security', 'off', true);
  
  -- Get the studio ID before deletion (for cleanup)
  SELECT assigned_studio_id INTO v_studio_id
  FROM public.student_applications
  WHERE id = p_application_id;
  
  -- If application doesn't exist, return empty result
  IF v_studio_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT '{}'::JSONB, 0;
    RETURN;
  END IF;

  -- Delete related records (most have CASCADE, but we'll track them)
  -- Note: Due to CASCADE constraints, most will auto-delete, but we track for reporting
  
  -- Delete application steps
  DELETE FROM public.student_application_steps WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_application_steps', v_deleted_count);
  
  -- Delete documents (also need to delete from storage, but that's handled by trigger or app)
  DELETE FROM public.student_documents WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_documents', v_deleted_count);
  
  -- Delete signatures
  DELETE FROM public.student_signatures WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_signatures', v_deleted_count);
  
  -- Delete DocuSign envelopes
  DELETE FROM public.docusign_envelopes WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('docusign_envelopes', v_deleted_count);
  
  -- Delete Stripe payments
  DELETE FROM public.stripe_payments WHERE student_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('stripe_payments', v_deleted_count);
  
  -- Delete manual payments
  DELETE FROM public.manual_payments WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('manual_payments', v_deleted_count);
  
  -- Delete partner referrals
  DELETE FROM public.partner_referrals WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('partner_referrals', v_deleted_count);
  
  -- Delete application cashbacks
  DELETE FROM public.application_cashbacks WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('application_cashbacks', v_deleted_count);
  
  -- Update refunds (set application_id to NULL)
  UPDATE public.refunds SET application_id = NULL WHERE application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('refunds_updated', v_deleted_count);
  
  -- Update any applications that reference this as previous_application_id
  UPDATE public.student_applications 
  SET previous_application_id = NULL 
  WHERE previous_application_id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('rebooking_references_updated', v_deleted_count);
  
  -- Free up the studio if it was assigned
  IF v_studio_id IS NOT NULL THEN
    UPDATE public.studios
    SET 
      status = 'available',
      allocation = NULL
    WHERE id = v_studio_id;
    v_deleted_tables := v_deleted_tables || jsonb_build_object('studio_freed', v_studio_id::TEXT);
  END IF;
  
  -- Finally, delete the application itself
  DELETE FROM public.student_applications WHERE id = p_application_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted_tables := v_deleted_tables || jsonb_build_object('student_applications', v_deleted_count);
  
  -- Calculate total deleted
  -- Only sum numeric values, skip text values like 'studio_freed'
  SELECT SUM((value::TEXT)::INTEGER) INTO v_deleted_count
  FROM jsonb_each_text(v_deleted_tables)
  WHERE key != 'studio_freed' AND value ~ '^[0-9]+$';
  
  -- If sum is NULL (no numeric values), set to 0
  v_deleted_count := COALESCE(v_deleted_count, 0);
  
  RETURN QUERY SELECT v_deleted_tables, v_deleted_count;
END;
$_$;


ALTER FUNCTION "public"."delete_student_application"("p_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_application_id UUID;
  v_student_id UUID;
  v_total_deleted INTEGER := 0;
  v_users_deleted INTEGER := 0;
  v_users_preserved INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_user_details JSONB := '[]'::JSONB;
  v_result RECORD;
  v_deleted_tables JSONB;
  v_total_records INTEGER;
  v_total_applications INTEGER;
  v_user_role TEXT;
  v_has_remaining_apps BOOLEAN;
  v_has_refunds BOOLEAN;
  v_has_maintenance BOOLEAN;
  v_has_utility_payments BOOLEAN;
  v_has_activity_logs BOOLEAN;
  v_should_preserve BOOLEAN;
  v_preservation_reason TEXT;
  v_deleted_user_ids UUID[] := '{}';
  v_preserved_user_ids UUID[] := '{}';
  v_student_ids_from_apps UUID[] := '{}';
BEGIN
  -- Disable RLS for this function
  SET LOCAL row_security = off;
  
  -- Validate academic year exists
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_academic_year_id) THEN
    RAISE EXCEPTION 'Academic year with id % does not exist', p_academic_year_id;
  END IF;

  -- Count applications for this academic year
  SELECT COUNT(*) INTO v_total_applications
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  WHERE c.academic_year_id = p_academic_year_id;
  
  -- If no applications, return early
  IF v_total_applications = 0 THEN
    RETURN jsonb_build_object(
      'deleted_count', 0,
      'users_deleted', 0,
      'users_preserved', 0,
      'details', '[]'::JSONB,
      'user_details', '[]'::JSONB,
      'message', format('No applications found for academic year %s to delete', p_academic_year_id),
      'total_found', v_total_applications
    );
  END IF;

  -- Loop through applications for the specified academic year
  FOR v_application_id IN 
    SELECT sa.id 
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    WHERE c.academic_year_id = p_academic_year_id
    ORDER BY sa.created_at ASC
  LOOP
    BEGIN
      -- Get student_id before deletion
      SELECT sa.student_id INTO v_student_id
      FROM public.student_applications sa
      WHERE sa.id = v_application_id;
      
      -- Add to collection if not already present
      IF v_student_id IS NOT NULL AND NOT (v_student_id = ANY(v_student_ids_from_apps)) THEN
        v_student_ids_from_apps := v_student_ids_from_apps || v_student_id;
      END IF;
      
      -- Call the delete function
      SELECT deleted_tables, total_deleted INTO STRICT v_deleted_tables, v_total_records
      FROM public.delete_student_application(v_application_id);
      
      v_total_deleted := v_total_deleted + 1;
      v_details := v_details || jsonb_build_object(
        'application_id', v_application_id,
        'student_id', v_student_id,
        'deleted_tables', v_deleted_tables,
        'total_deleted', v_total_records,
        'success', true
      );
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned no rows - application may not exist or RLS blocked access',
          'error_code', 'P0002',
          'success', false
        );
        RAISE WARNING 'Delete function returned no rows for application %', v_application_id;
      WHEN TOO_MANY_ROWS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', 'Delete function returned multiple rows',
          'error_code', 'P0003',
          'success', false
        );
        RAISE WARNING 'Delete function returned multiple rows for application %', v_application_id;
      WHEN OTHERS THEN
        v_details := v_details || jsonb_build_object(
          'application_id', v_application_id,
          'error', SQLERRM,
          'error_code', SQLSTATE,
          'success', false
        );
        RAISE WARNING 'Failed to delete application %: % (Code: %)', v_application_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  
  -- Step 2: Smart User Deletion (if enabled)
  IF p_delete_orphaned_users THEN
    -- Process each unique student_id
    FOREACH v_student_id IN ARRAY v_student_ids_from_apps
    LOOP
      -- Skip if already processed
      IF v_student_id = ANY(v_deleted_user_ids) OR v_student_id = ANY(v_preserved_user_ids) THEN
        CONTINUE;
      END IF;
      
      -- Initialize preservation check
      v_should_preserve := false;
      v_preservation_reason := '';
      v_user_role := NULL;
      v_has_remaining_apps := false;
      v_has_refunds := false;
      v_has_maintenance := false;
      v_has_utility_payments := false;
      v_has_activity_logs := false;
      
      -- Rule 1: Check if user is staff/superadmin
      SELECT role INTO v_user_role
      FROM public.profiles
      WHERE id = v_student_id;
      
      IF v_user_role IN ('staff', 'superadmin') THEN
        v_should_preserve := true;
        v_preservation_reason := 'User is staff/superadmin';
      END IF;
      
      -- Rule 2: Check for remaining applications
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_remaining_apps
        FROM public.student_applications
        WHERE student_id = v_student_id;
        
        IF v_has_remaining_apps THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has remaining applications';
        END IF;
      END IF;
      
      -- Rule 3: Check for refunds
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_refunds
        FROM public.refunds
        WHERE student_id = v_student_id;
        
        IF v_has_refunds THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has refund records (accounting requirement)';
        END IF;
      END IF;
      
      -- Rule 4: Check for maintenance requests
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_maintenance
        FROM public.maintenance_requests
        WHERE student_id = v_student_id;
        
        IF v_has_maintenance THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has maintenance request history';
        END IF;
      END IF;
      
      -- Rule 5: Check for utility payments created by user
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_utility_payments
        FROM public.utility_payments
        WHERE created_by = v_student_id;
        
        IF v_has_utility_payments THEN
          v_should_preserve := true;
          v_preservation_reason := 'User created utility payment records (financial audit)';
        END IF;
      END IF;
      
      -- Rule 6: Check for activity logs
      IF NOT v_should_preserve THEN
        SELECT COUNT(*) > 0 INTO v_has_activity_logs
        FROM public.staff_activity_logs
        WHERE staff_id = v_student_id;
        
        IF v_has_activity_logs THEN
          v_should_preserve := true;
          v_preservation_reason := 'User has activity log entries (audit trail)';
        END IF;
      END IF;
      
      -- Decision: Delete or Preserve
      IF v_should_preserve THEN
        v_users_preserved := v_users_preserved + 1;
        v_preserved_user_ids := v_preserved_user_ids || v_student_id;
        v_user_details := v_user_details || jsonb_build_object(
          'user_id', v_student_id,
          'action', 'preserved',
          'reason', v_preservation_reason,
          'has_remaining_apps', v_has_remaining_apps,
          'has_refunds', v_has_refunds,
          'has_maintenance', v_has_maintenance,
          'has_utility_payments', v_has_utility_payments,
          'has_activity_logs', v_has_activity_logs,
          'role', v_user_role
        );
      ELSE
        -- Safe to delete - user has no important data
        BEGIN
          -- Delete from auth.users (will cascade to profiles, notifications, etc.)
          DELETE FROM auth.users WHERE id = v_student_id;
          
          v_users_deleted := v_users_deleted + 1;
          v_deleted_user_ids := v_deleted_user_ids || v_student_id;
          v_user_details := v_user_details || jsonb_build_object(
            'user_id', v_student_id,
            'action', 'deleted',
            'reason', 'No important data found - safe to delete',
            'has_remaining_apps', false,
            'has_refunds', false,
            'has_maintenance', false,
            'has_utility_payments', false,
            'has_activity_logs', false
          );
        EXCEPTION
          WHEN OTHERS THEN
            -- Deletion failed (e.g., RESTRICT constraint)
            v_users_preserved := v_users_preserved + 1;
            v_preserved_user_ids := v_preserved_user_ids || v_student_id;
            v_user_details := v_user_details || jsonb_build_object(
              'user_id', v_student_id,
              'action', 'preserved',
              'reason', 'Deletion blocked: ' || SQLERRM,
              'error', SQLERRM,
              'error_code', SQLSTATE
            );
        END;
      END IF;
    END LOOP;
  END IF;
  
  -- Cleanup orphaned studio allocations
  UPDATE public.studios
  SET 
    allocation = NULL,
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' THEN 'available'
      ELSE status
    END
  WHERE 
    allocation IS NOT NULL
    AND allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND allocation::UUID NOT IN (
      SELECT id FROM public.student_applications
    );
  
  -- Clear all expired reservations
  UPDATE public.studios
  SET 
    reservation_expires_at = NULL,
    status = CASE 
      WHEN status = 'reserved' AND reservation_expires_at < NOW() THEN 'available'
      ELSE status
    END
  WHERE 
    reservation_expires_at IS NOT NULL
    AND reservation_expires_at < NOW();
  
  -- Reset any studios that are still marked as reserved but have no allocation
  UPDATE public.studios
  SET 
    status = 'available',
    allocation = NULL,
    reservation_expires_at = NULL
  WHERE 
    status = 'reserved'
    AND (allocation IS NULL OR allocation = '');
  
  -- Return comprehensive result
  RETURN jsonb_build_object(
    'deleted_count', v_total_deleted,
    'users_deleted', v_users_deleted,
    'users_preserved', v_users_preserved,
    'details', v_details,
    'user_details', v_user_details,
    'cleanup_performed', true,
    'message', format(
      'Deleted %s applications for academic year. Users: %s deleted, %s preserved.',
      v_total_deleted,
      v_users_deleted,
      v_users_preserved
    )
  );
END;
$_$;


ALTER FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean) IS 'Deletes all student applications for a specific academic year. If p_delete_orphaned_users is true, intelligently deletes orphaned user accounts that have no important data. Staff accounts are never deleted.';



CREATE OR REPLACE FUNCTION "public"."export_get_enums"() RETURNS TABLE("enum_name" "text", "schema_name" "text", "enum_values" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.typname::text,
    n.nspname::text,
    array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[]
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON t.typnamespace = n.oid
  WHERE n.nspname = 'public'
  GROUP BY t.typname, n.nspname
  ORDER BY n.nspname, t.typname;
END;
$$;


ALTER FUNCTION "public"."export_get_enums"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_functions"() RETURNS TABLE("schema_name" "text", "function_name" "text", "arguments" "text", "return_type" "text", "definition" "text", "comment" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.nspname::text,
    p.proname::text,
    pg_get_function_arguments(p.oid)::text,
    pg_get_function_result(p.oid)::text,
    pg_get_functiondef(p.oid)::text,
    COALESCE(obj_description(p.oid, 'pg_proc'), '')::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname IN ('public', 'storage')
    AND p.prokind = 'f'
  ORDER BY n.nspname, p.proname;
END;
$$;


ALTER FUNCTION "public"."export_get_functions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_grants"() RETURNS TABLE("grantee" "text", "table_schema" "text", "table_name" "text", "privilege_type" "text", "is_grantable" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    grantee::text,
    table_schema::text,
    table_name::text,
    privilege_type::text,
    is_grantable::text
  FROM information_schema.role_table_grants
  WHERE table_schema IN ('public', 'storage')
    AND grantee IN ('authenticated', 'anon', 'service_role')
  ORDER BY table_schema, table_name, grantee, privilege_type;
END;
$$;


ALTER FUNCTION "public"."export_get_grants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_indexes"() RETURNS TABLE("schemaname" "text", "tablename" "text", "indexname" "text", "indexdef" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname::text,
    tablename::text,
    indexname::text,
    indexdef::text
  FROM pg_indexes
  WHERE schemaname IN ('public', 'storage')
  ORDER BY schemaname, tablename, indexname;
END;
$$;


ALTER FUNCTION "public"."export_get_indexes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_rls_policies"() RETURNS TABLE("schemaname" "text", "tablename" "text", "policyname" "text", "permissive" "text", "roles" "text"[], "cmd" "text", "qual" "text", "with_check" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname::text,
    tablename::text,
    policyname::text,
    permissive::text,
    roles::text[],
    cmd::text,
    qual::text,
    with_check::text
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
  ORDER BY schemaname, tablename, policyname;
END;
$$;


ALTER FUNCTION "public"."export_get_rls_policies"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_tables"() RETURNS TABLE("table_schema" "text", "table_name" "text", "table_type" "text", "table_comment" "text", "columns" "jsonb", "constraints" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_schema::text,
    t.table_name::text,
    t.table_type::text,
    COALESCE(obj_description(c.oid, 'pg_class'), '')::text as table_comment,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'column_name', column_name,
          'data_type', data_type,
          'udt_name', udt_name,
          'character_maximum_length', character_maximum_length,
          'numeric_precision', numeric_precision,
          'numeric_scale', numeric_scale,
          'is_nullable', is_nullable,
          'column_default', column_default,
          'ordinal_position', ordinal_position
        ) ORDER BY ordinal_position
      )
      FROM information_schema.columns
      WHERE table_schema = t.table_schema AND table_name = t.table_name
    ) as columns,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'constraint_name', tc.constraint_name,
          'constraint_type', tc.constraint_type,
          'column_name', kcu.column_name,
          'foreign_table_schema', ccu.table_schema,
          'foreign_table_name', ccu.table_name,
          'foreign_column_name', ccu.column_name,
          'update_rule', rc.update_rule,
          'delete_rule', rc.delete_rule
        )
      )
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name
    ) as constraints
  FROM information_schema.tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema IN ('public', 'storage')
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_schema, t.table_name;
END;
$$;


ALTER FUNCTION "public"."export_get_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_triggers"() RETURNS TABLE("trigger_schema" "text", "trigger_name" "text", "event_manipulation" "text", "event_object_table" "text", "action_statement" "text", "action_timing" "text", "action_orientation" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    trigger_schema::text,
    trigger_name::text,
    event_manipulation::text,
    event_object_table::text,
    action_statement::text,
    action_timing::text,
    action_orientation::text
  FROM information_schema.triggers
  WHERE trigger_schema IN ('public', 'storage')
  ORDER BY trigger_schema, event_object_table, trigger_name;
END;
$$;


ALTER FUNCTION "public"."export_get_triggers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_get_views"() RETURNS TABLE("table_schema" "text", "table_name" "text", "view_definition" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    table_schema::text,
    table_name::text,
    view_definition::text
  FROM information_schema.views
  WHERE table_schema IN ('public', 'storage')
  ORDER BY table_schema, table_name;
END;
$$;


ALTER FUNCTION "public"."export_get_views"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_user_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT id FROM auth.users WHERE email = LOWER(p_email) LIMIT 1;
$$;


ALTER FUNCTION "public"."find_user_by_email"("p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."find_user_by_email"("p_email" "text") IS 'Find user ID by email (case-insensitive)';



CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats"("p_academic_year_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_students" bigint, "total_applications" bigint, "confirmed_applications" bigint, "recent_applications" bigint, "total_revenue" numeric, "occupancy_total" bigint, "occupancy_occupied" bigint, "occupancy_percentage" numeric, "upcoming_instalments_count" bigint, "upcoming_instalments_total" numeric, "upcoming_instalments_next_due" "date", "pending_verifications" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_contract_ids uuid[] := null;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if p_academic_year_id is not null then
    select coalesce(array_agg(id), array[]::uuid[])
      into v_contract_ids
      from public.contracts
      where academic_year_id = p_academic_year_id;
  end if;

  select count(*) into total_students
  from public.profiles
  where role = 'student';

  if p_academic_year_id is not null then
    select
      count(*)::bigint,
      count(*) filter (where status = 'confirmed')::bigint,
      count(*) filter (where created_at >= (now() - interval '7 days'))::bigint
    into
      total_applications,
      confirmed_applications,
      recent_applications
    from public.student_applications
    where contract_id = any(v_contract_ids);
  else
    select
      count(*)::bigint,
      count(*) filter (where status = 'confirmed')::bigint,
      count(*) filter (where created_at >= (now() - interval '7 days'))::bigint
    into
      total_applications,
      confirmed_applications,
      recent_applications
    from public.student_applications;
  end if;

  select coalesce(sum(amount_paid), 0)
    into total_revenue
  from public.unified_payment_history
  where payment_status in ('completed', 'succeeded');

  if p_academic_year_id is not null then
    select
      count(*)::bigint,
      count(*) filter (where effective_status = 'occupied')::bigint
    into
      occupancy_total,
      occupancy_occupied
    from public.studio_status_by_academic_year
    where academic_year_id = p_academic_year_id
      and is_active is true;
  else
    select
      count(*)::bigint,
      count(*) filter (where status = 'occupied')::bigint
    into
      occupancy_total,
      occupancy_occupied
    from public.studios
    where is_active is true;
  end if;

  occupancy_percentage :=
    case
      when occupancy_total > 0
        then round((occupancy_occupied::numeric / occupancy_total) * 100)
      else 0
    end;

  select
    count(*)::bigint,
    coalesce(sum(amount), 0),
    min(due_date)
  into
    upcoming_instalments_count,
    upcoming_instalments_total,
    upcoming_instalments_next_due
  from public.contract_payment_schedule
  where due_date between current_date and (current_date + interval '30 days')
    and (
      p_academic_year_id is null
      or contract_id = any(v_contract_ids)
    );

  select count(*)::bigint
    into pending_verifications
  from public.student_documents
  where status = 'pending';

  return query
  select
    coalesce(total_students, 0),
    coalesce(total_applications, 0),
    coalesce(confirmed_applications, 0),
    coalesce(recent_applications, 0),
    coalesce(total_revenue, 0),
    coalesce(occupancy_total, 0),
    coalesce(occupancy_occupied, 0),
    coalesce(occupancy_percentage, 0),
    coalesce(upcoming_instalments_count, 0),
    coalesce(upcoming_instalments_total, 0),
    upcoming_instalments_next_due,
    coalesce(pending_verifications, 0);
end;
$$;


ALTER FUNCTION "public"."get_admin_dashboard_stats"("p_academic_year_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_application_total_with_cashback"("p_application_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_total_due NUMERIC;
  v_cashback NUMERIC;
BEGIN
  -- Get total due from payment schedule
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_due
  FROM public.contract_payment_schedule cps
  INNER JOIN public.student_applications sa ON sa.contract_id = cps.contract_id
  WHERE sa.id = p_application_id;

  -- Get cashback amount
  SELECT COALESCE(cashback_amount, 0)
  INTO v_cashback
  FROM public.student_applications
  WHERE id = p_application_id;

  -- Return total minus cashback (minimum 0)
  RETURN GREATEST(COALESCE(v_total_due, 0) - COALESCE(v_cashback, 0), 0);
END;
$$;


ALTER FUNCTION "public"."get_application_total_with_cashback"("p_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text" DEFAULT NULL::"text", "p_studio_grade_id" "uuid" DEFAULT NULL::"uuid", "p_academic_year_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("studio_id" "uuid", "studio_number" "text", "studio_grade_id" "uuid", "studio_grade_name" "text", "allocation" "text", "studio_status" "text", "application_id" "uuid", "application_status" "text", "student_id" "uuid", "student_name" "text", "student_email" "text", "contract_id" "uuid", "contract_name" "text", "contract_start" "date", "contract_end" "date", "effective_check_in_date" "date", "effective_check_out_date" "date", "actual_check_in_date" "date", "actual_check_out_date" "date", "check_in_notes" "text", "check_out_notes" "text", "checked_in_by" "uuid", "checked_out_by" "uuid", "checked_in_at" timestamp with time zone, "checked_out_at" timestamp with time zone, "academic_year_id" "uuid", "academic_year_name" "text", "application_created_at" timestamp with time zone, "submitted_at" timestamp with time zone, "cancelled_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bcd.studio_id,
    bcd.studio_number,
    bcd.studio_grade_id,
    bcd.studio_grade_name,
    bcd.allocation,
    bcd.studio_status,
    bcd.application_id,
    bcd.application_status,
    bcd.student_id,
    bcd.student_name,
    COALESCE(u.email, '')::TEXT AS student_email,
    bcd.contract_id,
    bcd.contract_name,
    bcd.contract_start,
    bcd.contract_end,
    bcd.effective_check_in_date,
    bcd.effective_check_out_date,
    bcd.actual_check_in_date,
    bcd.actual_check_out_date,
    bcd.check_in_notes,
    bcd.check_out_notes,
    bcd.checked_in_by,
    bcd.checked_out_by,
    bcd.checked_in_at,
    bcd.checked_out_at,
    bcd.academic_year_id,
    bcd.academic_year_name,
    bcd.application_created_at,
    bcd.submitted_at,
    bcd.cancelled_at
  FROM public.booking_calendar_data bcd
  LEFT JOIN auth.users u ON u.id = bcd.student_id
  WHERE 
    (p_allocation IS NULL OR p_allocation = '' OR bcd.allocation = p_allocation)
    AND (p_studio_grade_id IS NULL OR bcd.studio_grade_id = p_studio_grade_id)
    AND (
      p_academic_year_id IS NULL 
      OR bcd.academic_year_id = p_academic_year_id 
      OR bcd.application_id IS NULL
    );
END;
$$;


ALTER FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text", "p_studio_grade_id" "uuid", "p_academic_year_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text", "p_studio_grade_id" "uuid", "p_academic_year_id" "uuid") IS 'Get booking calendar data with student email from auth.users, including check-in/check-out dates';



CREATE OR REPLACE FUNCTION "public"."get_contract_value"("p_application_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_weekly_price NUMERIC;
  v_weeks INTEGER;
  v_total NUMERIC;
BEGIN
  SELECT 
    COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
    c.weeks
  INTO v_weekly_price, v_weeks
  FROM public.student_applications sa
  INNER JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.studio_grade_prices sgp 
    ON c.studio_grade_id = sgp.studio_grade_id 
    AND c.academic_year_id = sgp.academic_year_id
    AND sgp.is_active = true
  WHERE sa.id = p_application_id;

  v_total := COALESCE(v_weekly_price, 0) * COALESCE(v_weeks, 0);
  RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."get_contract_value"("p_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_debug_logs"("p_function_name" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "function_name" "text", "application_id" "uuid", "message" "text", "data" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dl.id,
    dl.function_name,
    dl.application_id,
    dl.message,
    dl.data,
    dl.created_at
  FROM public.debug_logs dl
  WHERE (p_function_name IS NULL OR dl.function_name = p_function_name)
  ORDER BY dl.created_at DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_debug_logs"("p_function_name" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid" DEFAULT NULL::"uuid", "p_academic_year_id" "uuid" DEFAULT NULL::"uuid", "p_start_date" "text" DEFAULT NULL::"text", "p_end_date" "text" DEFAULT NULL::"text") RETURNS TABLE("application_id" "uuid", "student_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "contract_id" "uuid", "contract_name" "text", "academic_year_id" "uuid", "academic_year_name" "text", "total_due" numeric, "total_paid" numeric, "remaining_balance" numeric, "payment_status" "text", "last_payment_date" timestamp with time zone, "application_status" "text", "application_created_at" timestamp with time zone, "studio_number" "text", "studio_grade_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Convert text dates to DATE
  v_start_date := CASE WHEN p_start_date IS NULL OR p_start_date = '' THEN NULL ELSE p_start_date::DATE END;
  v_end_date := CASE WHEN p_end_date IS NULL OR p_end_date = '' THEN NULL ELSE p_end_date::DATE END;

  -- Execute query
  RETURN QUERY
  SELECT
    fps.application_id,
    fps.student_id,
    fps.first_name,
    fps.last_name,
    COALESCE(u.email, '')::TEXT AS email,
    fps.contract_id,
    fps.contract_name,
    fps.academic_year_id,
    fps.academic_year_name,
    fps.total_due,
    fps.total_paid,
    fps.remaining_balance,
    fps.payment_status,
    fps.last_payment_date,
    fps.application_status::TEXT, -- CAST enum to TEXT
    fps.application_created_at,
    fps.studio_number,
    fps.studio_grade_name
  FROM public.fully_paid_students fps
  LEFT JOIN auth.users u ON fps.student_id = u.id
  WHERE (p_contract_id IS NULL OR fps.contract_id = p_contract_id)
    AND (p_academic_year_id IS NULL OR fps.academic_year_id = p_academic_year_id)
    AND (v_start_date IS NULL OR fps.last_payment_date IS NULL OR DATE(fps.last_payment_date) >= v_start_date)
    AND (v_end_date IS NULL OR fps.last_payment_date IS NULL OR DATE(fps.last_payment_date) <= v_end_date)
  ORDER BY fps.last_payment_date DESC, fps.application_created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid", "p_academic_year_id" "uuid", "p_start_date" "text", "p_end_date" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid", "p_academic_year_id" "uuid", "p_start_date" "text", "p_end_date" "text") IS 'Returns fully paid students with optional filtering by contract, academic year, and date range.
Debug logging has been removed for production use.';



CREATE OR REPLACE FUNCTION "public"."get_partner_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_uid UUID;
  v_partner_id UUID;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT partner_id INTO v_partner_id
  FROM public.profiles
  WHERE id = current_uid
    AND role = 'partner';

  RETURN v_partner_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_partner_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") RETURNS TABLE("application_id" "uuid", "student_first_name" "text", "student_last_name" "text", "contract_name" "text", "academic_year_name" "text", "total_contract_value" numeric, "total_paid" numeric, "remaining_balance" numeric, "payment_status" "text", "commission_amount" numeric, "commission_status" "text", "last_payment_date" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id AS application_id,
    COALESCE(
      p.first_name,
      (sas1.payload->>'first_name')::TEXT,
      ''
    ) AS student_first_name,
    COALESCE(
      p.last_name,
      (sas1.payload->>'last_name')::TEXT,
      ''
    ) AS student_last_name,
    COALESCE(c.name, '') AS contract_name,
    COALESCE(ay.name, '') AS academic_year_name,
    COALESCE(pr.total_contract_value, 0) AS total_contract_value,
    0::NUMERIC AS total_paid,
    COALESCE(pr.total_contract_value, 0) AS remaining_balance,
    'unpaid'::TEXT AS payment_status,
    COALESCE(pr.commission_amount, 0) AS commission_amount,
    COALESCE(pr.commission_status, 'pending') AS commission_status,
    NULL::TIMESTAMPTZ AS last_payment_date
  FROM public.partner_referrals pr
  INNER JOIN public.student_applications sa ON pr.application_id = sa.id
  INNER JOIN public.profiles p ON sa.student_id = p.id
  LEFT JOIN public.contracts c ON sa.contract_id = c.id
  LEFT JOIN public.academic_years ay ON c.academic_year_id = ay.id
  LEFT JOIN public.student_application_steps sas1 ON sa.id = sas1.application_id AND sas1.step_number = 1
  WHERE pr.partner_id = p_partner_id
  ORDER BY sa.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") IS 'Returns referral summary for all referrals by a partner. Gets student names from profiles or application steps. Uses SECURITY DEFINER to bypass RLS.';



CREATE OR REPLACE FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") RETURNS TABLE("total_due" numeric, "total_paid" numeric, "remaining_balance" numeric, "payment_count" integer, "last_payment_date" timestamp with time zone, "payment_status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contract_total NUMERIC := 0;
  v_deposit_amount NUMERIC := 0;
  v_total_due NUMERIC := 0; -- This is for INSTALLMENTS ONLY (Contract Total - Deposit)
  v_cashback NUMERIC := 0;
  v_total_due_after_cashback NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_payment_count INTEGER := 0;
  v_last_payment_date TIMESTAMPTZ;
  v_contract_weekly_price NUMERIC;
  v_contract_weeks INTEGER;
  v_payment_plan_id UUID;
  v_contract_id UUID;
  v_remaining_balance NUMERIC;
  v_tolerance NUMERIC := 0.01; -- £0.01 tolerance for rounding
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::INTEGER, NULL::TIMESTAMPTZ, 'unpaid'::TEXT;
    RETURN;
  END IF;

  -- Get contract_id and payment plan
  SELECT 
    sa.contract_id,
    sa.selected_payment_plan_id
  INTO 
    v_contract_id,
    v_payment_plan_id
  FROM public.student_applications sa
  WHERE sa.id = p_application_id;

  -- Calculate Contract Total = weekly_price × weeks
  BEGIN
    SELECT 
      COALESCE(c.weekly_price_override, sgp.weekly_price, 0),
      COALESCE(c.weeks, 0)
    INTO 
      v_contract_weekly_price,
      v_contract_weeks
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.studio_grade_prices sgp 
      ON sgp.academic_year_id = c.academic_year_id 
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_contract_weekly_price := 0;
    v_contract_weeks := 0;
  END;

  v_contract_total := COALESCE(v_contract_weekly_price, 0) * COALESCE(v_contract_weeks, 0);

  -- Get Deposit amount
  BEGIN
    SELECT COALESCE(
      c.deposit_override,
      pp.deposit_amount,
      sgp.deposit_amount_override,
      0
    )
    INTO v_deposit_amount
    FROM public.student_applications sa
    INNER JOIN public.contracts c ON sa.contract_id = c.id
    LEFT JOIN public.payment_plans pp ON pp.id = v_payment_plan_id
    LEFT JOIN public.studio_grade_prices sgp 
      ON sgp.academic_year_id = c.academic_year_id 
      AND sgp.studio_grade_id = c.studio_grade_id
      AND sgp.is_active = true
    WHERE sa.id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_deposit_amount := 0;
  END;

  v_deposit_amount := COALESCE(v_deposit_amount, 0);

  -- CRITICAL: Calculate Total Due for INSTALLMENTS = Contract Total - Deposit
  -- This is the remaining balance that needs to be paid in installments
  v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);

  -- If contract_payment_schedule exists, use it (but verify it matches our calculation)
  -- This handles cases where schedule was pre-generated
  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_due
    FROM public.contract_payment_schedule
    WHERE contract_id = v_contract_id;
    
    -- If schedule exists and is not empty, use it
    -- Otherwise, keep the calculated value (Contract Total - Deposit)
    IF v_total_due IS NULL OR v_total_due = 0 THEN
      v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
  END;

  -- If still no total_due, calculate from payment plan installments
  -- But ensure installments are calculated from REMAINING BALANCE, not total
  IF COALESCE(v_total_due, 0) = 0 AND v_payment_plan_id IS NOT NULL THEN
    BEGIN
      -- Calculate remaining balance first
      v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0);
      SELECT COALESCE(SUM(
        CASE 
          WHEN amount_type = 'percentage' THEN (v_remaining_balance * amount_value / 100)
          WHEN amount_type = 'fixed' THEN amount_value
          ELSE 0
        END
      ), 0)
      INTO v_total_due
      FROM public.payment_plan_installments
      WHERE payment_plan_id = v_payment_plan_id;
    EXCEPTION WHEN OTHERS THEN
      v_total_due := GREATEST(v_contract_total - v_deposit_amount, 0);
    END;
  END IF;
  
  -- Ensure v_total_due is never NULL and represents installments only
  v_total_due := COALESCE(v_total_due, 0);

  -- Get cashback
  BEGIN
    SELECT COALESCE(cashback_amount, 0)
    INTO v_cashback
    FROM public.student_applications
    WHERE id = p_application_id;
  EXCEPTION WHEN OTHERS THEN
    v_cashback := 0;
  END;

  -- Apply cashback to installment total (not contract total)
  v_total_due_after_cashback := GREATEST(v_total_due - COALESCE(v_cashback, 0), 0);

  -- Get total paid from installment payments only
  BEGIN
    -- Try stripe_payments first - this is the source of truth
    SELECT 
      COALESCE(SUM(amount), 0),
      COUNT(*),
      MAX(created_at)
    INTO v_total_paid, v_payment_count, v_last_payment_date
    FROM public.stripe_payments
    WHERE student_application_id = p_application_id
      AND payment_type = 'instalment'
      AND status IN ('succeeded', 'completed');
    
    -- If stripe_payments returns 0 or NULL, try unified_payment_history as fallback
    IF COALESCE(v_total_paid, 0) = 0 OR v_total_paid IS NULL THEN
      SELECT 
        COALESCE(SUM(amount_paid), 0),
        COUNT(*),
        MAX(payment_date)
      INTO v_total_paid, v_payment_count, v_last_payment_date
      FROM public.unified_payment_history
      WHERE student_application_id = p_application_id
        AND payment_status IN ('succeeded', 'completed')
        AND (
          payment_metadata->>'type' = 'instalment'
          OR installment_number IS NOT NULL
        )
        AND COALESCE(payment_metadata->>'type', '') != 'deposit';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total_paid := 0;
    v_payment_count := 0;
    v_last_payment_date := NULL;
  END;

  -- Ensure v_total_paid is never NULL
  v_total_paid := COALESCE(v_total_paid, 0);

  -- Calculate remaining balance
  -- If total_paid >= total_due_after_cashback (within small tolerance), set to 0
  v_remaining_balance := GREATEST(v_total_due_after_cashback - v_total_paid, 0);
  -- If very close to fully paid (within tolerance), set to 0
  IF ABS(v_total_due_after_cashback - v_total_paid) <= v_tolerance AND v_total_paid > 0 THEN
    v_remaining_balance := 0;
  END IF;

  RETURN QUERY SELECT 
    v_total_due_after_cashback,
    v_total_paid,
    v_remaining_balance AS remaining_balance,
    COALESCE(v_payment_count, 0),
    v_last_payment_date,
    CASE 
      WHEN v_remaining_balance <= 0.01 AND v_total_paid > 0
        THEN 'fully_paid'
      WHEN v_total_due_after_cashback <= 0.01
        THEN 'fully_paid'
      WHEN v_total_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END;
END;
$$;


ALTER FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") IS 'Calculates payment summary for installments only (excludes deposit).
Formula: Total Due = Contract Total - Deposit
Installments are calculated from remaining balance, not contract total.
This ensures remaining balance = 0 when all installments are paid.';



CREATE OR REPLACE FUNCTION "public"."get_rebooking_data"("p_previous_application_id" "uuid") RETURNS TABLE("step1_data" "jsonb", "step2_data" "jsonb", "step3_data" "jsonb", "step4_data" "jsonb", "step5_data" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 1 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 2 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 3 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 4 LIMIT 1),
    (SELECT payload FROM public.student_application_steps WHERE application_id = p_previous_application_id AND step_number = 5 LIMIT 1);
END;
$$;


ALTER FUNCTION "public"."get_rebooking_data"("p_previous_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_revenue_summary"("p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date", "p_group_by" "text" DEFAULT 'month'::"text") RETURNS TABLE("period_label" "text", "period_start" "date", "period_end" "date", "deposit_revenue" numeric, "installment_revenue" numeric, "total_revenue" numeric, "payment_count" bigint, "stripe_revenue" numeric, "manual_revenue" numeric, "total_refunds" numeric, "net_revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  -- Set default date range if not provided
  v_start := COALESCE(p_start_date, DATE_TRUNC('year', CURRENT_DATE));
  v_end := COALESCE(p_end_date, CURRENT_DATE);
  
  RETURN QUERY
  WITH payment_data AS (
    SELECT 
      uph.payment_date::DATE AS payment_date,
      uph.amount_paid,
      uph.payment_source,
      CASE 
        WHEN uph.payment_metadata->>'type' = 'deposit' THEN 'deposit'
        ELSE 'installment'
      END AS payment_type
    FROM public.unified_payment_history uph
    WHERE uph.payment_status = 'succeeded'
      AND uph.payment_date::DATE BETWEEN v_start AND v_end
  ),
  refund_data AS (
    -- Get refunds for the period (both Stripe and manual)
    SELECT 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', processed_at)::DATE
        ELSE 
          DATE_TRUNC('month', processed_at)::DATE
      END AS refund_period,
      SUM(amount_gbp) AS total_refunds
    FROM public.refunds
    WHERE status = 'succeeded'
      AND processed_at::DATE BETWEEN v_start AND v_end
    GROUP BY refund_period
  ),
  period_data AS (
    SELECT 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_data.payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_data.payment_date)::DATE
      END AS period_start,
      SUM(CASE WHEN payment_data.payment_type = 'deposit' THEN payment_data.amount_paid ELSE 0 END) AS deposit_revenue,
      SUM(CASE WHEN payment_data.payment_type = 'installment' THEN payment_data.amount_paid ELSE 0 END) AS installment_revenue,
      SUM(payment_data.amount_paid) AS total_revenue,
      COUNT(*) AS payment_count,
      SUM(CASE WHEN payment_data.payment_source = 'stripe' THEN payment_data.amount_paid ELSE 0 END) AS stripe_revenue,
      SUM(CASE WHEN payment_data.payment_source = 'manual' THEN payment_data.amount_paid ELSE 0 END) AS manual_revenue
    FROM payment_data
    GROUP BY 
      CASE 
        WHEN p_group_by = 'quarter' THEN 
          DATE_TRUNC('quarter', payment_data.payment_date)::DATE
        ELSE 
          DATE_TRUNC('month', payment_data.payment_date)::DATE
      END
  )
  SELECT 
    CASE 
      WHEN p_group_by = 'quarter' THEN 
        'Q' || TO_CHAR(period_data.period_start, 'Q') || ' ' || TO_CHAR(period_data.period_start, 'YYYY')
      ELSE 
        TO_CHAR(period_data.period_start, 'Month YYYY')
    END AS period_label,
    period_data.period_start,
    CASE 
      WHEN p_group_by = 'quarter' THEN 
        (period_data.period_start + INTERVAL '3 months - 1 day')::DATE
      ELSE 
        (period_data.period_start + INTERVAL '1 month - 1 day')::DATE
    END AS period_end,
    period_data.deposit_revenue,
    period_data.installment_revenue,
    period_data.total_revenue,
    period_data.payment_count,
    period_data.stripe_revenue,
    period_data.manual_revenue,
    COALESCE(rd.total_refunds, 0) AS total_refunds,
    period_data.total_revenue - COALESCE(rd.total_refunds, 0) AS net_revenue
  FROM period_data
  LEFT JOIN refund_data rd ON rd.refund_period = period_data.period_start
  ORDER BY period_data.period_start;
END;
$$;


ALTER FUNCTION "public"."get_revenue_summary"("p_start_date" "date", "p_end_date" "date", "p_group_by" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_revenue_summary"("p_start_date" "date", "p_end_date" "date", "p_group_by" "text") IS 'Revenue Summary Report - Shows revenue by month/quarter with breakdown by payment type. Now includes refunds subtraction to show net revenue.';



CREATE OR REPLACE FUNCTION "public"."get_route_permissions_for_role"("p_role" "text") RETURNS TABLE("route_path" "text", "route_name" "text", "allowed" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT route_path, route_name, allowed
  FROM public.route_permissions
  WHERE role = p_role
  ORDER BY route_path;
$$;


ALTER FUNCTION "public"."get_route_permissions_for_role"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_staff_subrole"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT staff_subrole
  FROM public.profiles
  WHERE id = p_user_id
    AND role = 'staff';
$$;


ALTER FUNCTION "public"."get_staff_subrole"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_studio_availability"("p_studio_grade_id" "uuid", "p_contract_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_capacity" integer, "available_count" integer, "reserved_count" integer, "occupied_count" integer, "maintenance_count" integer, "availability_percentage" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_total INTEGER;
  v_available INTEGER;
  v_reserved INTEGER;
  v_occupied INTEGER;
  v_maintenance INTEGER;
  v_percentage NUMERIC;
BEGIN
  -- Count total capacity (active studios only, excluding maintenance and OTA/Keyworkers allocated)
  SELECT COUNT(*)
  INTO v_total
  FROM public.studios
  WHERE studio_grade_id = p_studio_grade_id
    AND is_active = true
    AND status != 'maintenance'
    AND (allocation IS NULL OR allocation NOT IN ('OTA', 'Keyworkers'));

  -- If contract_id provided, filter by studios assigned to applications for this contract
  IF p_contract_id IS NOT NULL THEN
    -- Count available (status = 'available' AND not reserved by any application for this contract)
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.reservation_expires_at IS NULL 
        OR s.reservation_expires_at < NOW()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_applications sa
        WHERE sa.assigned_studio_id = s.id
          AND sa.contract_id = p_contract_id
          AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification', 'confirmed')
          AND (
            sa.reserved_studio_expires_at IS NULL
            OR sa.reserved_studio_expires_at > NOW()
          )
      );

    -- Count reserved (status = 'reserved' OR has active reservation for this contract)
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.status = 'reserved'
        OR EXISTS (
          SELECT 1
          FROM public.student_applications sa
          WHERE sa.assigned_studio_id = s.id
            AND sa.contract_id = p_contract_id
            AND sa.status IN ('draft', 'awaiting_deposit', 'awaiting_signature', 'awaiting_verification')
            AND (
              sa.reserved_studio_expires_at IS NOT NULL
              AND sa.reserved_studio_expires_at > NOW()
            )
        )
      );

    -- Count occupied (status = 'occupied' OR confirmed applications for this contract)
    -- AND not allocated to OTA/Keyworkers
    SELECT COUNT(DISTINCT s.id)
    INTO v_occupied
    FROM public.studios s
    INNER JOIN public.student_applications sa ON sa.assigned_studio_id = s.id
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND sa.contract_id = p_contract_id
      AND sa.status = 'confirmed';
  ELSE
    -- No contract filter - count all studios for this grade (excluding OTA/Keyworkers)
    SELECT COUNT(*)
    INTO v_available
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'available'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'))
      AND (
        s.reservation_expires_at IS NULL 
        OR s.reservation_expires_at < NOW()
      );

    SELECT COUNT(*)
    INTO v_reserved
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'reserved'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'));

    SELECT COUNT(*)
    INTO v_occupied
    FROM public.studios s
    WHERE s.studio_grade_id = p_studio_grade_id
      AND s.is_active = true
      AND s.status = 'occupied'
      AND (s.allocation IS NULL OR s.allocation NOT IN ('OTA', 'Keyworkers'));
  END IF;

  -- Count maintenance (always excluded from capacity)
  SELECT COUNT(*)
  INTO v_maintenance
  FROM public.studios s
  WHERE s.studio_grade_id = p_studio_grade_id
    AND s.is_active = true
    AND s.status = 'maintenance';

  -- Calculate percentage
  IF v_total > 0 THEN
    v_percentage := ROUND((v_available::NUMERIC / v_total::NUMERIC) * 100, 2);
  ELSE
    v_percentage := 0;
  END IF;

  RETURN QUERY SELECT 
    COALESCE(v_total, 0),
    COALESCE(v_available, 0),
    COALESCE(v_reserved, 0),
    COALESCE(v_occupied, 0),
    COALESCE(v_maintenance, 0),
    COALESCE(v_percentage, 0);
END;
$$;


ALTER FUNCTION "public"."get_studio_availability"("p_studio_grade_id" "uuid", "p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_with_roles"() RETURNS TABLE("id" "uuid", "email" "text", "created_at" timestamp with time zone, "roles" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- Check if the current user is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    u.created_at,
    COALESCE(
      ARRAY_AGG(ur.role::TEXT) FILTER (WHERE ur.role IS NOT NULL),
      ARRAY[]::TEXT[]
    ) as roles
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON u.id = ur.user_id
  GROUP BY u.id, u.email, u.created_at
  ORDER BY u.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_users_with_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_application_confirmation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- If application status changed to 'confirmed' and has an assigned studio
  IF NEW.status = 'confirmed' AND NEW.assigned_studio_id IS NOT NULL THEN
    -- Update studio status to 'occupied' and set allocation to 'Student'
    UPDATE public.studios
    SET status = 'occupied',
        allocation = 'Student'  -- Set permanent allocation to Student
    WHERE id = NEW.assigned_studio_id;
  END IF;

  -- If application status changed from 'confirmed' to something else
  IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' AND OLD.assigned_studio_id IS NOT NULL THEN
    -- Release the studio back to available and clear allocation
    UPDATE public.studios
    SET status = 'available',
        allocation = NULL  -- Clear allocation when unconfirmed
    WHERE id = OLD.assigned_studio_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_application_confirmation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_partner"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_uid UUID;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role = 'partner'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."is_partner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_uid UUID;
BEGIN
  current_uid := auth.uid();

  IF current_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_uid
      AND p.role IN ('staff', 'superadmin')
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong (e.g. RLS recursion), fail closed but without crashing policy evaluation
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_partner_account"("p_referral_code" "text", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_partner_id UUID;
  v_code_already_linked BOOLEAN;
BEGIN
  -- Normalize referral code
  p_referral_code := UPPER(TRIM(p_referral_code));
  
  -- Find partner by referral code
  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE UPPER(TRIM(referral_code)) = p_referral_code
    AND is_active = true;
  
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code. Please check and try again.';
  END IF;
  
  -- Check if referral code is already linked to another account
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE partner_id = v_partner_id
      AND id != p_user_id
  ) INTO v_code_already_linked;
  
  IF v_code_already_linked THEN
    RAISE EXCEPTION 'This referral code is already linked to another account. Please contact admin.';
  END IF;
  
  -- Link account to partner
  UPDATE public.profiles
  SET 
    role = 'partner',
    partner_id = v_partner_id
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."link_partner_account"("p_referral_code" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payment_id UUID;
  v_payment_type TEXT;
  v_amount NUMERIC;
BEGIN
  -- Find the payment by receipt number
  SELECT mp.id, mp.payment_type, mp.amount
  INTO v_payment_id, v_payment_type, v_amount
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
    AND mp.application_id IS NULL  -- Only link unlinked payments
  LIMIT 1;

  -- If payment not found or already linked, return error
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already linked';
  END IF;

  -- Verify application exists
  IF NOT EXISTS (SELECT 1 FROM public.student_applications WHERE id = p_application_id) THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Link the payment to the application
  UPDATE public.manual_payments
  SET application_id = p_application_id,
      updated_at = NOW()
  WHERE id = v_payment_id;

  -- Return the payment ID
  RETURN v_payment_id;
END;
$$;


ALTER FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") IS 'Link an unlinked payment (identified by receipt number) to an application. Only works if payment is not already linked.';



CREATE OR REPLACE FUNCTION "public"."log_staff_activity"("p_action" "text", "p_entity_type" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verify user is staff
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can log activities';
  END IF;

  -- Insert the log
  INSERT INTO public.staff_activity_logs (
    staff_id,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_payload
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


ALTER FUNCTION "public"."log_staff_activity"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_application_contract_value"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    NEW.total_contract_value := public.calculate_contract_value(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_application_contract_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_current_timestamp_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."student_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "assigned_studio_id" "uuid",
    "status" "public"."application_status" DEFAULT 'draft'::"public"."application_status" NOT NULL,
    "stripe_customer_id" "text",
    "deposit_payment_intent_id" "text",
    "reserved_studio_expires_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_payment_plan_id" "uuid",
    "total_contract_value" numeric(10,2),
    "is_rebooking" boolean DEFAULT false,
    "previous_application_id" "uuid",
    "rebooking_reason" "text",
    "rebooking_approved_at" timestamp with time zone,
    "rebooking_approved_by" "uuid",
    "referred_by_partner_id" "uuid",
    "cashback_amount" numeric(10,2) DEFAULT 0,
    "validated_referral_code" "text",
    "actual_check_in_date" "date",
    "actual_check_out_date" "date",
    "check_in_notes" "text",
    "check_out_notes" "text",
    "checked_in_by" "uuid",
    "checked_out_by" "uuid",
    "checked_in_at" timestamp with time zone,
    "checked_out_at" timestamp with time zone
);


ALTER TABLE "public"."student_applications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."student_applications"."is_rebooking" IS 'Indicates if this is a rebooking application';



COMMENT ON COLUMN "public"."student_applications"."previous_application_id" IS 'Links to the previous application if this is a rebooking';



COMMENT ON COLUMN "public"."student_applications"."rebooking_reason" IS 'Reason for rebooking (e.g., "Returning after gap year")';



COMMENT ON COLUMN "public"."student_applications"."rebooking_approved_at" IS 'Timestamp when rebooking was approved by finance';



COMMENT ON COLUMN "public"."student_applications"."rebooking_approved_by" IS 'User ID of staff member who approved rebooking';



COMMENT ON COLUMN "public"."student_applications"."referred_by_partner_id" IS 'Partner who referred this application (if applicable)';



COMMENT ON COLUMN "public"."student_applications"."cashback_amount" IS 'Cashback amount applied to this application (denormalized for quick access)';



CREATE OR REPLACE FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") RETURNS "public"."student_applications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  updated_row public.student_applications;
  requester uuid;
begin
  requester := auth.uid();

  if requester is null then
    raise exception 'Not authenticated';
  end if;

  update public.student_applications
  set selected_payment_plan_id = p_plan_id,
      updated_at = now()
  where id = p_application_id
    and student_id = requester
  returning * into updated_row;

  if not found then
    raise exception 'Application not found or access denied';
  end if;

  return updated_row;
end;
$$;


ALTER FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(p_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  -- Use Supabase's crypt function to hash the password
  -- Note: This requires the pgcrypto extension
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Update the password in auth.users
  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_password,
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") IS 'Sets a user password by email. Requires pgcrypto extension. Usage: SELECT set_user_password(''user@example.com'', ''newpassword'');';



CREATE OR REPLACE FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_encrypted_password TEXT;
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User with ID % not found', p_user_id;
  END IF;

  -- Use Supabase's crypt function to hash the password
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  -- Update the password in auth.users
  UPDATE auth.users
  SET 
    encrypted_password = v_encrypted_password,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") IS 'Sets a user password by user ID. Requires pgcrypto extension. Usage: SELECT set_user_password_by_id(''uuid-here'', ''newpassword'');';



CREATE OR REPLACE FUNCTION "public"."trigger_release_expired_reservations"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
BEGIN
  -- This function is a placeholder for external cron services
  -- External services should call the edge function directly via HTTP
  -- This function exists for documentation purposes
  result := jsonb_build_object(
    'message', 'This function should be called via HTTP to the release-expired-reservations edge function',
    'endpoint', '/functions/v1/release-expired-reservations',
    'method', 'POST',
    'note', 'Use external cron service (GitHub Actions, Vercel Cron, etc.) to call the edge function directly'
  );
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."trigger_release_expired_reservations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_release_expired_reservations"() IS 'Helper function for releasing expired studio reservations. 
External cron services should call the edge function directly via HTTP: 
POST https://your-project.supabase.co/functions/v1/release-expired-reservations
See .github/workflows/cron-jobs.yml for GitHub Actions example.';



CREATE OR REPLACE FUNCTION "public"."update_maintenance_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_maintenance_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_utility_payments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_utility_payments_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_referral_code"("p_code" "text") RETURNS TABLE("is_valid" boolean, "partner_id" "uuid", "partner_name" "text", "commission_percentage" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_partner_id UUID;
  v_partner_name TEXT;
  v_commission_percentage NUMERIC;
BEGIN
  -- Normalize code (uppercase, trim)
  p_code := UPPER(TRIM(p_code));
  
  -- Check if code exists and partner is active
  SELECT p.id, p.name, p.commission_percentage
  INTO v_partner_id, v_partner_name, v_commission_percentage
  FROM public.partners p
  WHERE UPPER(TRIM(p.referral_code)) = p_code
    AND p.is_active = true;
  
  IF v_partner_id IS NOT NULL THEN
    RETURN QUERY SELECT
      true::BOOLEAN AS is_valid,
      v_partner_id::UUID AS partner_id,
      v_partner_name::TEXT AS partner_name,
      v_commission_percentage::NUMERIC AS commission_percentage;
  ELSE
    RETURN QUERY SELECT
      false::BOOLEAN AS is_valid,
      NULL::UUID AS partner_id,
      NULL::TEXT AS partner_name,
      NULL::NUMERIC AS commission_percentage;
  END IF;
END;
$$;


ALTER FUNCTION "public"."validate_referral_code"("p_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_referral_code"("p_code" "text") IS 'Validates a referral code and returns partner information if valid. 
Uses SECURITY DEFINER to bypass RLS so students can validate codes without direct access to partners table.';



CREATE OR REPLACE FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") RETURNS TABLE("id" "uuid", "payment_type" "text", "amount" numeric, "payment_method" "text", "payment_date" "date", "is_linked" boolean, "application_id" "uuid", "recorded_by" "uuid", "notes" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.payment_type,
    mp.amount,
    mp.payment_method,
    mp.payment_date,
    (mp.application_id IS NOT NULL) AS is_linked,
    mp.application_id,
    mp.recorded_by,
    mp.notes,
    mp.created_at
  FROM public.manual_payments mp
  WHERE mp.receipt_number = p_receipt_number
  ORDER BY mp.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") IS 'Verify a payment by receipt number. Returns payment details if found, including whether it is already linked to an application.';



CREATE TABLE IF NOT EXISTS "public"."academic_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academic_year_dates_check" CHECK (("start_date" < "end_date"))
);


ALTER TABLE "public"."academic_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."application_cashbacks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "cashback_amount" numeric(10,2) NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."application_cashbacks" OWNER TO "postgres";


COMMENT ON TABLE "public"."application_cashbacks" IS 'Tracks which applications have cashback applied and the amount';



CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "payment_plan_id" "uuid",
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "summary" "text",
    "contract_start" "date" NOT NULL,
    "contract_end" "date" NOT NULL,
    "weeks" integer NOT NULL,
    "weekly_price_override" numeric(10,2),
    "deposit_override" numeric(10,2),
    "cta_label" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracts_date_check" CHECK (("contract_start" < "contract_end"))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "partner_id" "uuid",
    "staff_subrole" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."staff_subrole" IS 'Staff sub-role for UI organization (operations_manager, reservationist, accountant, front_desk). 
   Only used for display/filtering. Backend permissions still use role = ''staff''.';



CREATE TABLE IF NOT EXISTS "public"."studio_grades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "short_description" "text",
    "long_description" "text",
    "max_occupancy" integer,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "promo_video_url" "text"
);


ALTER TABLE "public"."studio_grades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_number" "text" NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "floor" "text",
    "status" "public"."studio_status" DEFAULT 'available'::"public"."studio_status" NOT NULL,
    "allocation" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "reservation_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "studios_allocation_check" CHECK ((("allocation" IS NULL) OR ("allocation" = 'Student'::"text") OR ("allocation" = 'OTA'::"text") OR ("allocation" = 'Keyworkers'::"text") OR ("allocation" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text")))
);


ALTER TABLE "public"."studios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."studios"."allocation" IS 'Studio allocation category: NULL (Unallocated), "Student", "OTA", "Keyworkers", or UUID (temporary student reservation during 30-min hold period)';



CREATE OR REPLACE VIEW "public"."accounts_receivable_report" AS
 SELECT "sa"."id" AS "application_id",
    "sa"."student_id",
    (("p"."first_name" || ' '::"text") || "p"."last_name") AS "student_name",
    "sa"."status" AS "application_status",
    "c"."name" AS "contract_name",
    "sg"."name" AS "studio_grade",
    "sa"."total_contract_value",
    COALESCE("ac"."cashback_amount", (0)::numeric) AS "cashback_amount",
    (COALESCE("sa"."total_contract_value", (0)::numeric) - COALESCE("ac"."cashback_amount", (0)::numeric)) AS "adjusted_contract_value",
    COALESCE("ps"."total_due", (0)::numeric) AS "total_due",
    COALESCE("ps"."total_paid", (0)::numeric) AS "total_paid",
    COALESCE("ps"."remaining_balance", (0)::numeric) AS "outstanding_balance",
    "ps"."payment_status",
    "sa"."assigned_studio_id",
    "s"."studio_number",
    "sa"."created_at" AS "application_date",
    "c"."contract_start",
    "c"."contract_end",
    "ay"."name" AS "academic_year_name"
   FROM ((((((("public"."student_applications" "sa"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "sa"."student_id")))
     LEFT JOIN "public"."contracts" "c" ON (("c"."id" = "sa"."contract_id")))
     LEFT JOIN "public"."studio_grades" "sg" ON (("sg"."id" = "sa"."studio_grade_id")))
     LEFT JOIN "public"."studios" "s" ON (("s"."id" = "sa"."assigned_studio_id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("ay"."id" = "c"."academic_year_id")))
     LEFT JOIN "public"."application_cashbacks" "ac" ON (("ac"."application_id" = "sa"."id")))
     CROSS JOIN LATERAL "public"."get_payment_summary"("sa"."id") "ps"("total_due", "total_paid", "remaining_balance", "payment_count", "last_payment_date", "payment_status"))
  WHERE (("sa"."status" = ANY (ARRAY['confirmed'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status"])) AND (COALESCE("ps"."remaining_balance", (0)::numeric) > (0)::numeric));


ALTER VIEW "public"."accounts_receivable_report" OWNER TO "postgres";


COMMENT ON VIEW "public"."accounts_receivable_report" IS 'Accounts Receivable Report - Shows all money owed to the company by students';



CREATE TABLE IF NOT EXISTS "public"."amenities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."amenities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_payment_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "label" "text",
    "sequence" smallint NOT NULL,
    "due_date" "date" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contract_payment_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid",
    "payment_type" "text" NOT NULL,
    "instalment_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "receipt_number" "text",
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "recorded_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoice_number" "text",
    "invoice_generated_at" timestamp with time zone,
    CONSTRAINT "manual_payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'bank_transfer'::"text", 'cheque'::"text"]))),
    CONSTRAINT "manual_payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['deposit'::"text", 'instalment'::"text"])))
);


ALTER TABLE "public"."manual_payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."manual_payments"."application_id" IS 'Application this payment is linked to. NULL means payment was recorded before application was created. Payment can be linked later when student verifies receipt number.';



COMMENT ON COLUMN "public"."manual_payments"."receipt_number" IS 'Unique receipt or cheque number. Used by students to verify and link payments in Step 5. Must be unique across all payments.';



COMMENT ON COLUMN "public"."manual_payments"."invoice_number" IS 'Sequential invoice number (e.g., INV-STUDENT-2025-001)';



COMMENT ON COLUMN "public"."manual_payments"."invoice_generated_at" IS 'Timestamp when invoice PDF was generated';



CREATE TABLE IF NOT EXISTS "public"."payment_plan_installments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_plan_id" "uuid" NOT NULL,
    "sequence" smallint NOT NULL,
    "label" "text",
    "due_date_offset_days" integer,
    "due_date" "date",
    "amount_type" "public"."payment_amount_type" DEFAULT 'percentage'::"public"."payment_amount_type" NOT NULL,
    "amount_value" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_plan_installment_due_check" CHECK ((("due_date_offset_days" IS NOT NULL) OR ("due_date" IS NOT NULL))),
    CONSTRAINT "payment_plan_installment_percentage_check" CHECK (((("amount_type" = 'percentage'::"public"."payment_amount_type") AND ("amount_value" >= (0)::numeric) AND ("amount_value" <= (100)::numeric)) OR ("amount_type" = 'fixed'::"public"."payment_amount_type")))
);


ALTER TABLE "public"."payment_plan_installments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "deposit_amount" numeric(10,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_application_id" "uuid" NOT NULL,
    "payment_plan_id" "uuid",
    "stripe_payment_intent_id" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "payment_type" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text",
    "invoice_number" "text",
    "invoice_generated_at" timestamp with time zone,
    CONSTRAINT "stripe_payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['deposit'::"text", 'instalment'::"text"]))),
    CONSTRAINT "stripe_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."stripe_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_payments" IS 'Tracks individual Stripe payment transactions (deposits and installments)';



COMMENT ON COLUMN "public"."stripe_payments"."stripe_payment_intent_id" IS 'Stripe Payment Intent ID - unique identifier from Stripe';



COMMENT ON COLUMN "public"."stripe_payments"."payment_type" IS 'Type of payment: deposit or instalment';



COMMENT ON COLUMN "public"."stripe_payments"."stripe_customer_id" IS 'Stripe Customer ID - links payment to Stripe customer record';



COMMENT ON COLUMN "public"."stripe_payments"."invoice_number" IS 'Sequential invoice number (e.g., INV-STUDENT-2025-001)';



COMMENT ON COLUMN "public"."stripe_payments"."invoice_generated_at" IS 'Timestamp when invoice PDF was generated';



CREATE OR REPLACE VIEW "public"."unified_payment_history" AS
 SELECT 'stripe'::"text" AS "payment_source",
    "sp"."id" AS "payment_id",
    "sp"."student_application_id",
    "sp"."payment_plan_id",
    "sp"."amount" AS "amount_paid",
    "sp"."currency",
    "sp"."status" AS "payment_status",
    "sp"."stripe_payment_intent_id",
    "sp"."created_at" AS "payment_date",
    "sp"."updated_at",
    NULL::"uuid" AS "manual_entry_id",
    NULL::"text" AS "manual_entry_notes",
    NULL::"uuid" AS "entered_by_user_id",
    "sa"."student_id",
        CASE
            WHEN (("sp"."metadata" ->> 'instalment_id'::"text") IS NOT NULL) THEN COALESCE(( SELECT "cps"."sequence"
               FROM "public"."contract_payment_schedule" "cps"
              WHERE (("cps"."id")::"text" = ("sp"."metadata" ->> 'instalment_id'::"text"))
             LIMIT 1), ( SELECT "ppi"."sequence"
               FROM "public"."payment_plan_installments" "ppi"
              WHERE (("ppi"."id")::"text" = ("sp"."metadata" ->> 'instalment_id'::"text"))
             LIMIT 1))
            ELSE NULL::smallint
        END AS "installment_number",
        CASE
            WHEN (("sp"."metadata" ->> 'instalment_id'::"text") IS NOT NULL) THEN COALESCE(( SELECT "cps"."due_date"
               FROM "public"."contract_payment_schedule" "cps"
              WHERE (("cps"."id")::"text" = ("sp"."metadata" ->> 'instalment_id'::"text"))
             LIMIT 1), ( SELECT
                    CASE
                        WHEN ("ppi"."due_date" IS NOT NULL) THEN "ppi"."due_date"
                        WHEN ("ppi"."due_date_offset_days" IS NOT NULL) THEN (("c_1"."contract_start" + ((COALESCE("ppi"."due_date_offset_days", 0))::double precision * '1 day'::interval)))::"date"
                        ELSE NULL::"date"
                    END AS "case"
               FROM (("public"."payment_plan_installments" "ppi"
                 JOIN "public"."student_applications" "sa2" ON (("sa2"."selected_payment_plan_id" = "ppi"."payment_plan_id")))
                 JOIN "public"."contracts" "c_1" ON (("sa2"."contract_id" = "c_1"."id")))
              WHERE ((("ppi"."id")::"text" = ("sp"."metadata" ->> 'instalment_id'::"text")) AND ("sa2"."id" = "sp"."student_application_id"))
             LIMIT 1))
            ELSE NULL::"date"
        END AS "due_date",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    (COALESCE("sp"."metadata", '{}'::"jsonb") || "jsonb_build_object"('type', "sp"."payment_type")) AS "payment_metadata"
   FROM ((("public"."stripe_payments" "sp"
     JOIN "public"."student_applications" "sa" ON (("sp"."student_application_id" = "sa"."id")))
     LEFT JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")))
  WHERE ("sp"."status" = ANY (ARRAY['succeeded'::"text", 'completed'::"text"]))
UNION ALL
 SELECT 'stripe'::"text" AS "payment_source",
    "gen_random_uuid"() AS "payment_id",
    "sa"."id" AS "student_application_id",
    NULL::"uuid" AS "payment_plan_id",
    (COALESCE("c"."deposit_override", "pp"."deposit_amount", (0)::numeric))::numeric(10,2) AS "amount_paid",
    'GBP'::"text" AS "currency",
    'succeeded'::"text" AS "payment_status",
    "sa"."deposit_payment_intent_id" AS "stripe_payment_intent_id",
    COALESCE("sa"."submitted_at", "sa"."created_at") AS "payment_date",
    "sa"."updated_at",
    NULL::"uuid" AS "manual_entry_id",
    NULL::"text" AS "manual_entry_notes",
    NULL::"uuid" AS "entered_by_user_id",
    "sa"."student_id",
    NULL::integer AS "installment_number",
    NULL::"date" AS "due_date",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    "jsonb_build_object"('type', 'deposit') AS "payment_metadata"
   FROM ((("public"."student_applications" "sa"
     LEFT JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
     LEFT JOIN "public"."payment_plans" "pp" ON (("c"."payment_plan_id" = "pp"."id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")))
  WHERE (("sa"."deposit_payment_intent_id" IS NOT NULL) AND ("sa"."deposit_payment_intent_id" !~~ 'manual-%'::"text") AND (NOT (EXISTS ( SELECT 1
           FROM "public"."stripe_payments" "sp2"
          WHERE (("sp2"."stripe_payment_intent_id" = "sa"."deposit_payment_intent_id") AND ("sp2"."payment_type" = 'deposit'::"text"))))))
UNION ALL
 SELECT 'manual'::"text" AS "payment_source",
    "mp"."id" AS "payment_id",
    "mp"."application_id" AS "student_application_id",
    NULL::"uuid" AS "payment_plan_id",
    "mp"."amount" AS "amount_paid",
    'GBP'::"text" AS "currency",
    'completed'::"text" AS "payment_status",
    NULL::"text" AS "stripe_payment_intent_id",
    "mp"."payment_date",
    "mp"."created_at" AS "updated_at",
    "mp"."id" AS "manual_entry_id",
    "mp"."notes" AS "manual_entry_notes",
    "mp"."recorded_by" AS "entered_by_user_id",
    "sa"."student_id",
    "cps"."sequence" AS "installment_number",
    "cps"."due_date",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    "jsonb_build_object"('type', COALESCE("mp"."payment_type", 'manual'::"text"), 'notes', "mp"."notes") AS "payment_metadata"
   FROM (((("public"."manual_payments" "mp"
     JOIN "public"."student_applications" "sa" ON (("mp"."application_id" = "sa"."id")))
     LEFT JOIN "public"."contract_payment_schedule" "cps" ON (("mp"."instalment_id" = "cps"."id")))
     LEFT JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")));


ALTER VIEW "public"."unified_payment_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bank_reconciliation_report" AS
 SELECT "uph"."payment_id",
    "uph"."payment_source",
    "uph"."student_application_id",
    COALESCE("uph"."student_id", "sa"."student_id") AS "student_id",
    COALESCE((("p"."first_name" || ' '::"text") || "p"."last_name"), 'Unknown Student'::"text") AS "student_name",
    "uph"."amount_paid",
    "uph"."currency",
    "uph"."payment_status",
    "uph"."payment_date",
    "uph"."stripe_payment_intent_id",
        CASE
            WHEN ("uph"."payment_source" = 'stripe'::"text") THEN 'Stripe'::"text"
            ELSE 'Manual Entry'::"text"
        END AS "payment_method",
    "uph"."manual_entry_notes",
    "uph"."entered_by_user_id",
        CASE
            WHEN ("uph"."payment_source" = 'manual'::"text") THEN ( SELECT (("profiles"."first_name" || ' '::"text") || "profiles"."last_name")
               FROM "public"."profiles"
              WHERE ("profiles"."id" = "uph"."entered_by_user_id"))
            ELSE NULL::"text"
        END AS "entered_by_name",
        CASE
            WHEN (COALESCE(("uph"."payment_metadata" ->> 'type'::"text"), ''::"text") = 'deposit'::"text") THEN 'Deposit'::"text"
            WHEN ("uph"."installment_number" IS NULL) THEN 'Deposit'::"text"
            ELSE 'Installment'::"text"
        END AS "payment_type",
    "c"."name" AS "contract_name",
    "sg"."name" AS "studio_grade",
        CASE
            WHEN ("uph"."payment_source" = 'stripe'::"text") THEN ( SELECT "stripe_payments"."invoice_number"
               FROM "public"."stripe_payments"
              WHERE ("stripe_payments"."id" = "uph"."payment_id"))
            ELSE ( SELECT "manual_payments"."invoice_number"
               FROM "public"."manual_payments"
              WHERE ("manual_payments"."id" = "uph"."payment_id"))
        END AS "invoice_number",
        CASE
            WHEN ("uph"."payment_source" = 'stripe'::"text") THEN ( SELECT "stripe_payments"."invoice_generated_at"
               FROM "public"."stripe_payments"
              WHERE ("stripe_payments"."id" = "uph"."payment_id"))
            ELSE ( SELECT "manual_payments"."invoice_generated_at"
               FROM "public"."manual_payments"
              WHERE ("manual_payments"."id" = "uph"."payment_id"))
        END AS "invoice_generated_at"
   FROM (((("public"."unified_payment_history" "uph"
     LEFT JOIN "public"."student_applications" "sa" ON (("sa"."id" = "uph"."student_application_id")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = COALESCE("uph"."student_id", "sa"."student_id"))))
     LEFT JOIN "public"."contracts" "c" ON (("c"."id" = "sa"."contract_id")))
     LEFT JOIN "public"."studio_grades" "sg" ON (("sg"."id" = "sa"."studio_grade_id")))
  WHERE ("uph"."payment_status" = 'succeeded'::"text")
  ORDER BY "uph"."payment_date" DESC;


ALTER VIEW "public"."bank_reconciliation_report" OWNER TO "postgres";


COMMENT ON VIEW "public"."bank_reconciliation_report" IS 'Bank Reconciliation Report - Shows all payments with their source (Stripe vs Manual) for bank reconciliation';



CREATE TABLE IF NOT EXISTS "public"."student_application_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "step_number" smallint NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_application_steps" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."booking_calendar_data" AS
 SELECT "s"."id" AS "studio_id",
    "s"."studio_number",
    "s"."studio_grade_id",
    "sg"."name" AS "studio_grade_name",
    "s"."allocation",
    ("s"."status")::"text" AS "studio_status",
    "sa"."id" AS "application_id",
    ("sa"."status")::"text" AS "application_status",
    "sa"."student_id",
    COALESCE((("p"."first_name" || ' '::"text") || "p"."last_name"), ( SELECT TRIM(BOTH FROM ((COALESCE(("step1"."payload" ->> 'first_name'::"text"), ''::"text") || ' '::"text") || COALESCE(("step1"."payload" ->> 'last_name'::"text"), ''::"text"))) AS "btrim"
           FROM "public"."student_application_steps" "step1"
          WHERE (("step1"."application_id" = "sa"."id") AND ("step1"."step_number" = 1))
         LIMIT 1), 'Unknown'::"text") AS "student_name",
    NULL::"text" AS "student_email",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "c"."contract_start",
    "c"."contract_end",
    COALESCE("sa"."actual_check_in_date", "c"."contract_start") AS "effective_check_in_date",
    COALESCE("sa"."actual_check_out_date", "c"."contract_end") AS "effective_check_out_date",
    "sa"."actual_check_in_date",
    "sa"."actual_check_out_date",
    "sa"."check_in_notes",
    "sa"."check_out_notes",
    "sa"."checked_in_by",
    "sa"."checked_out_by",
    "sa"."checked_in_at",
    "sa"."checked_out_at",
    "c"."academic_year_id",
    "ay"."name" AS "academic_year_name",
    "sa"."created_at" AS "application_created_at",
    "sa"."submitted_at",
    "sa"."cancelled_at"
   FROM ((((("public"."studios" "s"
     JOIN "public"."studio_grades" "sg" ON (("sg"."id" = "s"."studio_grade_id")))
     LEFT JOIN "public"."student_applications" "sa" ON ((("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status"))))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "sa"."student_id")))
     LEFT JOIN "public"."contracts" "c" ON (("c"."id" = "sa"."contract_id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("ay"."id" = "c"."academic_year_id")))
  WHERE ("s"."is_active" = true)
  ORDER BY "s"."studio_grade_id", "s"."studio_number";


ALTER VIEW "public"."booking_calendar_data" OWNER TO "postgres";


COMMENT ON VIEW "public"."booking_calendar_data" IS 'Booking calendar data - Shows all studios with their bookings (confirmed applications) including contract dates and actual check-in/check-out dates';



CREATE TABLE IF NOT EXISTS "public"."branding_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text",
    "setting_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."branding_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."branding_settings" IS 'Stores branding assets, colors, fonts, and text content.
All system colors and fonts are centralized here for easy management.
Colors are stored in hex format (#RRGGBB).
Fonts are stored as font family names.';



CREATE TABLE IF NOT EXISTS "public"."bulk_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "notification_type" "text" DEFAULT 'info'::"text" NOT NULL,
    "email_template_id" "uuid",
    "sent_by" "uuid",
    "filters" "jsonb" DEFAULT '{}'::"jsonb",
    "total_recipients" integer DEFAULT 0 NOT NULL,
    "notifications_sent" integer DEFAULT 0 NOT NULL,
    "emails_sent" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "bulk_messages_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"]))),
    CONSTRAINT "bulk_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."bulk_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cashback_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cashback_amount" numeric(10,2) NOT NULL,
    "applies_to" "text" DEFAULT 'all'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "academic_year_id" "uuid",
    CONSTRAINT "cashback_campaigns_applies_to_check" CHECK (("applies_to" = ANY (ARRAY['all'::"text", 'new'::"text", 'rebooking'::"text"]))),
    CONSTRAINT "cashback_campaigns_date_check" CHECK (("start_date" <= "end_date"))
);


ALTER TABLE "public"."cashback_campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."cashback_campaigns" IS 'Stores cashback campaign definitions (e.g., £500 cashback for new students)';



COMMENT ON COLUMN "public"."cashback_campaigns"."academic_year_id" IS 'Academic year this campaign applies to. NULL means the campaign applies to all academic years.';



CREATE TABLE IF NOT EXISTS "public"."contract_payment_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "payment_plan_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contract_payment_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credential_key" "text" NOT NULL,
    "credential_value" "text" NOT NULL,
    "credential_type" "text" DEFAULT 'api_key'::"text" NOT NULL,
    "description" "text",
    "is_encrypted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credentials" OWNER TO "postgres";


COMMENT ON TABLE "public"."credentials" IS 'Stores API keys and credentials configurable via admin UI. Secured with RLS policies.';



COMMENT ON COLUMN "public"."credentials"."credential_key" IS 'Unique key identifier (e.g., resend_api_key)';



COMMENT ON COLUMN "public"."credentials"."credential_value" IS 'The actual credential value (API key, email, etc.)';



COMMENT ON COLUMN "public"."credentials"."is_encrypted" IS 'Flag indicating if value is encrypted (future enhancement)';



CREATE TABLE IF NOT EXISTS "public"."debug_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text" NOT NULL,
    "application_id" "uuid",
    "message" "text" NOT NULL,
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."debug_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."debug_policies" AS
 SELECT "schemaname",
    "tablename",
    "policyname",
    "roles",
    "cmd",
    "permissive",
    "qual",
    "with_check"
   FROM "pg_policies";


ALTER VIEW "public"."debug_policies" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."deposit_installment_breakdown" AS
 SELECT "sa"."id" AS "application_id",
    "sa"."student_id",
    (("p"."first_name" || ' '::"text") || "p"."last_name") AS "student_name",
    "c"."name" AS "contract_name",
    "sg"."name" AS "studio_grade",
    "sa"."total_contract_value",
    COALESCE(( SELECT "sum"("unified_payment_history"."amount_paid") AS "sum"
           FROM "public"."unified_payment_history"
          WHERE (("unified_payment_history"."student_application_id" = "sa"."id") AND (("unified_payment_history"."payment_metadata" ->> 'type'::"text") = 'deposit'::"text") AND ("unified_payment_history"."payment_status" = 'succeeded'::"text"))), (0)::numeric) AS "deposit_paid",
    COALESCE("pp"."deposit_amount", (0)::numeric) AS "expected_deposit",
    COALESCE(( SELECT "sum"("unified_payment_history"."amount_paid") AS "sum"
           FROM "public"."unified_payment_history"
          WHERE (("unified_payment_history"."student_application_id" = "sa"."id") AND (("unified_payment_history"."payment_metadata" ->> 'type'::"text") <> 'deposit'::"text") AND ("unified_payment_history"."payment_status" = 'succeeded'::"text"))), (0)::numeric) AS "installments_paid",
    (COALESCE("ps"."total_due", (0)::numeric) - COALESCE(( SELECT "sum"("unified_payment_history"."amount_paid") AS "sum"
           FROM "public"."unified_payment_history"
          WHERE (("unified_payment_history"."student_application_id" = "sa"."id") AND (("unified_payment_history"."payment_metadata" ->> 'type'::"text") = 'deposit'::"text") AND ("unified_payment_history"."payment_status" = 'succeeded'::"text"))), (0)::numeric)) AS "expected_installments",
    ( SELECT "count"(*) AS "count"
           FROM "public"."unified_payment_history"
          WHERE (("unified_payment_history"."student_application_id" = "sa"."id") AND (("unified_payment_history"."payment_metadata" ->> 'type'::"text") = 'deposit'::"text") AND ("unified_payment_history"."payment_status" = 'succeeded'::"text"))) AS "deposit_payment_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."unified_payment_history"
          WHERE (("unified_payment_history"."student_application_id" = "sa"."id") AND (("unified_payment_history"."payment_metadata" ->> 'type'::"text") <> 'deposit'::"text") AND ("unified_payment_history"."payment_status" = 'succeeded'::"text"))) AS "installment_payment_count",
    "sa"."status",
    "sa"."created_at" AS "application_date"
   FROM ((((("public"."student_applications" "sa"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "sa"."student_id")))
     LEFT JOIN "public"."contracts" "c" ON (("c"."id" = "sa"."contract_id")))
     LEFT JOIN "public"."studio_grades" "sg" ON (("sg"."id" = "sa"."studio_grade_id")))
     LEFT JOIN "public"."payment_plans" "pp" ON (("pp"."id" = "c"."payment_plan_id")))
     CROSS JOIN LATERAL "public"."get_payment_summary"("sa"."id") "ps"("total_due", "total_paid", "remaining_balance", "payment_count", "last_payment_date", "payment_status"))
  WHERE ("sa"."status" = ANY (ARRAY['confirmed'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status"]));


ALTER VIEW "public"."deposit_installment_breakdown" OWNER TO "postgres";


COMMENT ON VIEW "public"."deposit_installment_breakdown" IS 'Deposit vs Installment Breakdown - Shows breakdown of deposit vs installment payments';



CREATE TABLE IF NOT EXISTS "public"."docusign_envelopes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "envelope_type" "text" NOT NULL,
    "envelope_id" "text",
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "recipients" "jsonb",
    "metadata" "jsonb",
    "last_webhook_event" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."docusign_envelopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."docusign_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "template_type" "text" NOT NULL,
    "template_id" "text" NOT NULL,
    "role_names" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "docusign_templates_template_type_check" CHECK (("template_type" = ANY (ARRAY['tenancy'::"text", 'guarantor'::"text"])))
);


ALTER TABLE "public"."docusign_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."docusign_templates" IS 'Stores DocuSign template IDs per academic year for tenancy and guarantor agreements';



COMMENT ON COLUMN "public"."docusign_templates"."template_type" IS 'Type of template: tenancy or guarantor';



COMMENT ON COLUMN "public"."docusign_templates"."template_id" IS 'DocuSign template ID (GUID format)';



COMMENT ON COLUMN "public"."docusign_templates"."role_names" IS 'JSON object storing role names for the template, e.g. {"student": "Tenant", "witness": "Witness", "guarantor": "Guarantor"}';



CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_text" "text",
    "template_type" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_templates_template_type_check" CHECK (("template_type" = ANY (ARRAY['welcome'::"text", 'application_received'::"text", 'deposit_reminder'::"text", 'payment_reminder'::"text", 'overdue_payment'::"text", 'application_confirmed'::"text", 'document_approved'::"text", 'document_rejected'::"text", 'signature_reminder'::"text", 'email_confirmation'::"text", 'password_reset'::"text", 'account_invitation'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."utility_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "expense_category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "payment_date" "date" NOT NULL,
    "vendor_name" "text",
    "invoice_number" "text",
    "receipt_path" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "utility_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "utility_payments_expense_category_check" CHECK (("expense_category" = ANY (ARRAY['electricity'::"text", 'water'::"text", 'gas'::"text", 'internet'::"text", 'maintenance'::"text", 'cleaning'::"text", 'insurance'::"text", 'property_tax'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."utility_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."utility_payments" IS 'Utility and expense payments tracked per academic year';



COMMENT ON COLUMN "public"."utility_payments"."expense_category" IS 'Category of expense: electricity, water, gas, internet, maintenance, cleaning, insurance, property_tax, other';



COMMENT ON COLUMN "public"."utility_payments"."receipt_path" IS 'Storage path for receipt/invoice document';



CREATE OR REPLACE VIEW "public"."expense_summary_by_academic_year" AS
 SELECT "up"."academic_year_id",
    "ay"."name" AS "academic_year_name",
    "up"."expense_category",
    "count"(*) AS "expense_count",
    "sum"("up"."amount") AS "total_amount",
    "min"("up"."payment_date") AS "first_payment_date",
    "max"("up"."payment_date") AS "last_payment_date"
   FROM ("public"."utility_payments" "up"
     JOIN "public"."academic_years" "ay" ON (("ay"."id" = "up"."academic_year_id")))
  GROUP BY "up"."academic_year_id", "ay"."name", "up"."expense_category"
  ORDER BY "up"."academic_year_id", "up"."expense_category";


ALTER VIEW "public"."expense_summary_by_academic_year" OWNER TO "postgres";


COMMENT ON VIEW "public"."expense_summary_by_academic_year" IS 'Summary of expenses by academic year and category';



CREATE TABLE IF NOT EXISTS "public"."financial_forecast_breakdowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "forecast_id" "uuid" NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "contract_name" "text" NOT NULL,
    "studio_grade_name" "text" NOT NULL,
    "contract_weeks" integer NOT NULL,
    "weekly_price" numeric(10,2) NOT NULL,
    "total_contract_value" numeric(10,2) NOT NULL,
    "current_bookings" integer DEFAULT 0 NOT NULL,
    "students_needed" integer NOT NULL,
    "new_bookings_needed" integer NOT NULL,
    "revenue_contribution" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financial_forecast_breakdowns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "target_revenue" numeric(12,2) NOT NULL,
    "current_revenue" numeric(12,2) DEFAULT 0 NOT NULL,
    "revenue_gap" numeric(12,2) NOT NULL,
    "forecast_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financial_forecasts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fully_paid_students" AS
 SELECT DISTINCT "sa"."id" AS "application_id",
    "sa"."student_id",
    "p"."first_name",
    "p"."last_name",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    "ps"."total_due",
    "ps"."total_paid",
    "ps"."remaining_balance",
    "ps"."payment_status",
    "ps"."last_payment_date",
    "sa"."status" AS "application_status",
    "sa"."created_at" AS "application_created_at",
    "s"."studio_number",
    "sg"."name" AS "studio_grade_name"
   FROM (((((("public"."student_applications" "sa"
     JOIN "public"."profiles" "p" ON (("sa"."student_id" = "p"."id")))
     JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
     JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")))
     LEFT JOIN "public"."studios" "s" ON (("sa"."assigned_studio_id" = "s"."id")))
     LEFT JOIN "public"."studio_grades" "sg" ON (("s"."studio_grade_id" = "sg"."id")))
     CROSS JOIN LATERAL "public"."get_payment_summary"("sa"."id") "ps"("total_due", "total_paid", "remaining_balance", "payment_count", "last_payment_date", "payment_status"))
  WHERE (("sa"."status" = 'confirmed'::"public"."application_status") AND ("ps"."payment_status" = 'fully_paid'::"text") AND ("ps"."remaining_balance" <= (0)::numeric));


ALTER VIEW "public"."fully_paid_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "imported_by" "uuid",
    "import_type" "text" NOT NULL,
    "file_name" "text",
    "total_rows" integer,
    "succeeded" integer DEFAULT 0,
    "failed" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "report" "jsonb" DEFAULT '{}'::"jsonb",
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."import_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."import_history" IS 'Tracks all bulk import operations with detailed reports and errors';



CREATE TABLE IF NOT EXISTS "public"."maintenance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "application_id" "uuid",
    "studio_id" "uuid",
    "request_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "images" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_notes" "text",
    "academic_year_id" "uuid",
    CONSTRAINT "maintenance_requests_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "maintenance_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['maintenance'::"text", 'cleaning'::"text", 'general'::"text", 'other'::"text"]))),
    CONSTRAINT "maintenance_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."maintenance_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."maintenance_requests" IS 'Maintenance and general requests from students';



COMMENT ON COLUMN "public"."maintenance_requests"."request_type" IS 'Type of request: maintenance, cleaning, general, other';



COMMENT ON COLUMN "public"."maintenance_requests"."priority" IS 'Priority level: low, normal, high, urgent';



COMMENT ON COLUMN "public"."maintenance_requests"."status" IS 'Request status: pending, in_progress, resolved, cancelled';



COMMENT ON COLUMN "public"."maintenance_requests"."images" IS 'Array of storage paths for uploaded images';



CREATE TABLE IF NOT EXISTS "public"."navigation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "url" "text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "location" "text" DEFAULT 'header'::"text" NOT NULL,
    "opens_in_new_tab" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."navigation_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."navigation_items" IS 'Stores navigation items for header and footer with ordering and active status';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text",
    "message" "text",
    "metadata" "jsonb",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "is_starred" boolean DEFAULT false NOT NULL,
    "login_dialog_shown" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."login_dialog_shown" IS 'Tracks if the login dialog has been shown for this notification. Prevents showing dialog multiple times for the same message.';



CREATE TABLE IF NOT EXISTS "public"."opening_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_name" "text" NOT NULL,
    "day_order" integer NOT NULL,
    "open_time" time without time zone,
    "close_time" time without time zone,
    "is_closed" boolean DEFAULT false NOT NULL,
    "special_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "opening_hours_day_order_check" CHECK ((("day_order" >= 1) AND ("day_order" <= 7)))
);


ALTER TABLE "public"."opening_hours" OWNER TO "postgres";


COMMENT ON TABLE "public"."opening_hours" IS 'Stores structured opening hours for each day of the week';



CREATE OR REPLACE VIEW "public"."outstanding_balances_report" AS
 SELECT "sa"."id" AS "application_id",
    "sa"."student_id",
    (("p"."first_name" || ' '::"text") || "p"."last_name") AS "student_name",
    "sa"."status" AS "application_status",
    "c"."name" AS "contract_name",
    "sg"."name" AS "studio_grade",
    COALESCE("ps"."total_due", (0)::numeric) AS "total_due",
    COALESCE("ps"."total_paid", (0)::numeric) AS "total_paid",
    COALESCE("ps"."remaining_balance", (0)::numeric) AS "outstanding_balance",
    ( SELECT "min"("cps"."due_date") AS "min"
           FROM (("public"."contract_payment_schedule" "cps"
             LEFT JOIN "public"."stripe_payments" "sp" ON (((("sp"."metadata" ->> 'instalment_id'::"text") = ("cps"."id")::"text") AND ("sp"."status" = 'succeeded'::"text"))))
             LEFT JOIN "public"."manual_payments" "mp" ON (("mp"."instalment_id" = "cps"."id")))
          WHERE (("cps"."contract_id" = "sa"."contract_id") AND ("sp"."id" IS NULL) AND ("mp"."id" IS NULL) AND ("cps"."due_date" < CURRENT_DATE))) AS "oldest_unpaid_due_date",
        CASE
            WHEN (( SELECT "min"("cps"."due_date") AS "min"
               FROM (("public"."contract_payment_schedule" "cps"
                 LEFT JOIN "public"."stripe_payments" "sp" ON (((("sp"."metadata" ->> 'instalment_id'::"text") = ("cps"."id")::"text") AND ("sp"."status" = 'succeeded'::"text"))))
                 LEFT JOIN "public"."manual_payments" "mp" ON (("mp"."instalment_id" = "cps"."id")))
              WHERE (("cps"."contract_id" = "sa"."contract_id") AND ("sp"."id" IS NULL) AND ("mp"."id" IS NULL) AND ("cps"."due_date" < CURRENT_DATE))) IS NOT NULL) THEN (CURRENT_DATE - ( SELECT "min"("cps"."due_date") AS "min"
               FROM (("public"."contract_payment_schedule" "cps"
                 LEFT JOIN "public"."stripe_payments" "sp" ON (((("sp"."metadata" ->> 'instalment_id'::"text") = ("cps"."id")::"text") AND ("sp"."status" = 'succeeded'::"text"))))
                 LEFT JOIN "public"."manual_payments" "mp" ON (("mp"."instalment_id" = "cps"."id")))
              WHERE (("cps"."contract_id" = "sa"."contract_id") AND ("sp"."id" IS NULL) AND ("mp"."id" IS NULL) AND ("cps"."due_date" < CURRENT_DATE))))
            ELSE 0
        END AS "days_overdue",
    "sa"."created_at" AS "application_date",
    "c"."contract_start",
    "c"."contract_end"
   FROM (((("public"."student_applications" "sa"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "sa"."student_id")))
     LEFT JOIN "public"."contracts" "c" ON (("c"."id" = "sa"."contract_id")))
     LEFT JOIN "public"."studio_grades" "sg" ON (("sg"."id" = "sa"."studio_grade_id")))
     CROSS JOIN LATERAL "public"."get_payment_summary"("sa"."id") "ps"("total_due", "total_paid", "remaining_balance", "payment_count", "last_payment_date", "payment_status"))
  WHERE (("sa"."status" = ANY (ARRAY['confirmed'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status"])) AND (COALESCE("ps"."remaining_balance", (0)::numeric) > (0)::numeric));


ALTER VIEW "public"."outstanding_balances_report" OWNER TO "postgres";


COMMENT ON VIEW "public"."outstanding_balances_report" IS 'Outstanding Balances Report - Shows students with outstanding balances, grouped by age of debt';



CREATE TABLE IF NOT EXISTS "public"."partner_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "application_id" "uuid" NOT NULL,
    "referral_code" "text",
    "commission_percentage" numeric(5,2) NOT NULL,
    "total_contract_value" numeric(10,2) NOT NULL,
    "commission_amount" numeric(10,2) NOT NULL,
    "commission_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."partner_referrals" OWNER TO "postgres";


COMMENT ON TABLE "public"."partner_referrals" IS 'Tracks which applications are referred by partners and calculates commissions';



CREATE OR REPLACE VIEW "public"."partner_referred_applications" WITH ("security_invoker"='true') AS
 SELECT "sa"."id" AS "application_id",
    "sa"."status" AS "application_status",
    "sa"."created_at" AS "application_created_at",
    "sa"."validated_referral_code",
    "p"."first_name",
    "p"."last_name",
    "c"."name" AS "contract_name",
    "ay"."name" AS "academic_year_name",
    "pr"."commission_percentage",
    "pr"."total_contract_value",
    "pr"."commission_amount",
    "pr"."commission_status",
    "pr"."created_at" AS "referral_created_at",
    "pr"."paid_at"
   FROM (((("public"."student_applications" "sa"
     JOIN "public"."partner_referrals" "pr" ON (("sa"."id" = "pr"."application_id")))
     JOIN "public"."profiles" "p" ON (("sa"."student_id" = "p"."id")))
     LEFT JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
     LEFT JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")));


ALTER VIEW "public"."partner_referred_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "commission_percentage" numeric(5,2) DEFAULT 5.00 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "referral_code" "text"
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


COMMENT ON TABLE "public"."partners" IS 'Stores partner information and commission rates for referral program';



COMMENT ON COLUMN "public"."partners"."referral_code" IS 'Unique referral code for this partner. Students enter this code during application.';



CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "payment_intent_id" "text" NOT NULL,
    "stripe_refund_id" "text",
    "amount_pence" integer NOT NULL,
    "amount_gbp" numeric(10,2) GENERATED ALWAYS AS ((("amount_pence")::numeric / 100.0)) STORED,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "refunded_by" "uuid",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "refund_source" "text" DEFAULT 'stripe'::"text",
    "manual_refund_reference" "text",
    CONSTRAINT "check_refund_source_requirements" CHECK (((("refund_source" = 'stripe'::"text") AND ("stripe_refund_id" IS NOT NULL)) OR (("refund_source" = 'manual'::"text") AND ("manual_refund_reference" IS NOT NULL) AND ("stripe_refund_id" IS NULL)))),
    CONSTRAINT "refunds_refund_source_check" CHECK (("refund_source" = ANY (ARRAY['stripe'::"text", 'manual'::"text"]))),
    CONSTRAINT "refunds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."refunds" IS 'Records all refunds - both Stripe API refunds and manual refunds processed outside the system (e.g., bank transfers). Manual refunds are recorded-only and do not process through Stripe.';



CREATE TABLE IF NOT EXISTS "public"."route_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_path" "text" NOT NULL,
    "route_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "allowed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."route_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."route_permissions" IS 'Stores which roles have access to which routes. UI-level permissions only. RLS policies remain unchanged.';



CREATE TABLE IF NOT EXISTS "public"."social_media_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "url" "text",
    "is_enabled" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_media_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'tiktok'::"text", 'linkedin'::"text", 'facebook'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."social_media_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text",
    "mime_type" "text",
    "status" "public"."document_status" DEFAULT 'pending'::"public"."document_status" NOT NULL,
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "signature_type" "public"."signature_type" NOT NULL,
    "storage_path" "text" NOT NULL,
    "signature_external_id" "text",
    "metadata" "jsonb",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_signatures" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."studio_allocation_report" AS
SELECT
    NULL::"uuid" AS "studio_grade_id",
    NULL::"text" AS "studio_grade_name",
    NULL::"text" AS "studio_grade_slug",
    NULL::bigint AS "total_studios",
    NULL::bigint AS "active_studios",
    NULL::bigint AS "allocated_to_students",
    NULL::bigint AS "allocated_to_ota",
    NULL::bigint AS "allocated_to_keyworkers",
    NULL::bigint AS "unallocated",
    NULL::bigint AS "status_available",
    NULL::bigint AS "status_occupied",
    NULL::bigint AS "status_reserved",
    NULL::bigint AS "status_maintenance";


ALTER VIEW "public"."studio_allocation_report" OWNER TO "postgres";


COMMENT ON VIEW "public"."studio_allocation_report" IS 'Studio Allocation Report - Shows counts of studios by grade and allocation type (Student, OTA, Keyworkers, Unallocated)';



CREATE TABLE IF NOT EXISTS "public"."studio_grade_amenities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "amenity_id" "uuid" NOT NULL,
    "description_override" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_grade_amenities" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."studio_grade_availability" AS
 SELECT "sg"."id" AS "studio_grade_id",
    "sg"."name" AS "studio_grade_name",
    "sg"."slug" AS "studio_grade_slug",
    "c"."id" AS "contract_id",
    "c"."name" AS "contract_name",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    ( SELECT "get_studio_availability"."total_capacity"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "total_capacity",
    ( SELECT "get_studio_availability"."available_count"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "available_count",
    ( SELECT "get_studio_availability"."reserved_count"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "reserved_count",
    ( SELECT "get_studio_availability"."occupied_count"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "occupied_count",
    ( SELECT "get_studio_availability"."maintenance_count"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "maintenance_count",
    ( SELECT "get_studio_availability"."availability_percentage"
           FROM "public"."get_studio_availability"("sg"."id", "c"."id") "get_studio_availability"("total_capacity", "available_count", "reserved_count", "occupied_count", "maintenance_count", "availability_percentage")) AS "availability_percentage"
   FROM (("public"."studio_grades" "sg"
     CROSS JOIN "public"."contracts" "c")
     JOIN "public"."academic_years" "ay" ON (("c"."academic_year_id" = "ay"."id")))
  WHERE (("sg"."is_active" = true) AND ("c"."is_active" = true) AND ("ay"."is_active" = true));


ALTER VIEW "public"."studio_grade_availability" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."studio_grade_availability_by_year" AS
 SELECT "sg"."id" AS "studio_grade_id",
    "sg"."name" AS "studio_grade_name",
    "sg"."slug" AS "studio_grade_slug",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
    ("count"(DISTINCT
        CASE
            WHEN (("s"."status" <> 'maintenance'::"public"."studio_status") AND (("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"])))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "total_capacity",
    ("count"(DISTINCT
        CASE
            WHEN (("s"."status" = 'available'::"public"."studio_status") AND (("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"]))) AND (("s"."reservation_expires_at" IS NULL) OR ("s"."reservation_expires_at" < "now"())) AND (NOT (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status", 'confirmed'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NULL) OR ("sa"."reserved_studio_expires_at" > "now"()))))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "available_count",
    ("count"(DISTINCT
        CASE
            WHEN ((("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"]))) AND (("s"."status" = 'reserved'::"public"."studio_status") OR (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NOT NULL) AND ("sa"."reserved_studio_expires_at" > "now"()))))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "reserved_count",
    ("count"(DISTINCT
        CASE
            WHEN ((("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"]))) AND (("s"."status" = 'occupied'::"public"."studio_status") OR (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status")))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "occupied_count",
    ("count"(DISTINCT
        CASE
            WHEN ("s"."status" = 'maintenance'::"public"."studio_status") THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "maintenance_count",
        CASE
            WHEN ("count"(DISTINCT
            CASE
                WHEN (("s"."status" <> 'maintenance'::"public"."studio_status") AND (("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"])))) THEN "s"."id"
                ELSE NULL::"uuid"
            END) > 0) THEN "round"(((("count"(DISTINCT
            CASE
                WHEN (("s"."status" = 'available'::"public"."studio_status") AND (("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"]))) AND (("s"."reservation_expires_at" IS NULL) OR ("s"."reservation_expires_at" < "now"())) AND (NOT (EXISTS ( SELECT 1
                   FROM ("public"."student_applications" "sa"
                     JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
                  WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status", 'confirmed'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NULL) OR ("sa"."reserved_studio_expires_at" > "now"()))))))) THEN "s"."id"
                ELSE NULL::"uuid"
            END))::numeric / ("count"(DISTINCT
            CASE
                WHEN (("s"."status" <> 'maintenance'::"public"."studio_status") AND (("s"."allocation" IS NULL) OR ("s"."allocation" <> ALL (ARRAY['OTA'::"text", 'Keyworkers'::"text"])))) THEN "s"."id"
                ELSE NULL::"uuid"
            END))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "availability_percentage"
   FROM (("public"."studio_grades" "sg"
     CROSS JOIN "public"."academic_years" "ay")
     LEFT JOIN "public"."studios" "s" ON ((("sg"."id" = "s"."studio_grade_id") AND ("s"."is_active" = true))))
  WHERE (("sg"."is_active" = true) AND ("ay"."is_active" = true))
  GROUP BY "sg"."id", "sg"."name", "sg"."slug", "ay"."id", "ay"."name";


ALTER VIEW "public"."studio_grade_availability_by_year" OWNER TO "postgres";


COMMENT ON VIEW "public"."studio_grade_availability_by_year" IS 'Shows studio availability aggregated per studio grade per academic year. Excludes studios allocated to OTA or Keyworkers from student availability calculations. Studios booked for one academic year do not affect availability calculations for other years.';



CREATE OR REPLACE VIEW "public"."studio_grade_availability_summary" AS
 SELECT "sg"."id" AS "studio_grade_id",
    "sg"."name" AS "studio_grade_name",
    "sg"."slug" AS "studio_grade_slug",
    ("count"(DISTINCT "s"."id"))::integer AS "total_capacity",
    ("count"(DISTINCT
        CASE
            WHEN (("s"."status" = 'available'::"public"."studio_status") AND (("s"."reservation_expires_at" IS NULL) OR ("s"."reservation_expires_at" < "now"())) AND (NOT (EXISTS ( SELECT 1
               FROM "public"."student_applications" "sa"
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status", 'confirmed'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NULL) OR ("sa"."reserved_studio_expires_at" > "now"()))))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "available_count",
    ("count"(DISTINCT
        CASE
            WHEN (("s"."status" = 'reserved'::"public"."studio_status") OR (EXISTS ( SELECT 1
               FROM "public"."student_applications" "sa"
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NOT NULL) AND ("sa"."reserved_studio_expires_at" > "now"())))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "reserved_count",
    ("count"(DISTINCT
        CASE
            WHEN (("s"."status" = 'occupied'::"public"."studio_status") OR (EXISTS ( SELECT 1
               FROM "public"."student_applications" "sa"
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status"))))) THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "occupied_count",
    ("count"(DISTINCT
        CASE
            WHEN ("s"."status" = 'maintenance'::"public"."studio_status") THEN "s"."id"
            ELSE NULL::"uuid"
        END))::integer AS "maintenance_count",
        CASE
            WHEN ("count"(DISTINCT "s"."id") > 0) THEN "round"(((("count"(DISTINCT
            CASE
                WHEN (("s"."status" = 'available'::"public"."studio_status") AND (("s"."reservation_expires_at" IS NULL) OR ("s"."reservation_expires_at" < "now"())) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."student_applications" "sa"
                  WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status", 'confirmed'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NULL) OR ("sa"."reserved_studio_expires_at" > "now"()))))))) THEN "s"."id"
                ELSE NULL::"uuid"
            END))::numeric / ("count"(DISTINCT "s"."id"))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "availability_percentage"
   FROM ("public"."studio_grades" "sg"
     LEFT JOIN "public"."studios" "s" ON ((("sg"."id" = "s"."studio_grade_id") AND ("s"."is_active" = true) AND ("s"."status" <> 'maintenance'::"public"."studio_status"))))
  WHERE ("sg"."is_active" = true)
  GROUP BY "sg"."id", "sg"."name", "sg"."slug";


ALTER VIEW "public"."studio_grade_availability_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_grade_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "display_order" smallint DEFAULT 0 NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."studio_grade_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_grade_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "media_type" "text" NOT NULL,
    "title" "text",
    "description" "text",
    "url" "text" NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_hero" boolean DEFAULT false NOT NULL,
    CONSTRAINT "studio_grade_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."studio_grade_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studio_grade_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "studio_grade_id" "uuid" NOT NULL,
    "weekly_price" numeric(10,2) NOT NULL,
    "deposit_amount_override" numeric(10,2),
    "currency_code" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "studio_grade_prices_currency_check" CHECK (("char_length"("currency_code") = 3))
);


ALTER TABLE "public"."studio_grade_prices" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."studio_status_by_academic_year" AS
 SELECT "s"."id" AS "studio_id",
    "s"."studio_number",
    "s"."studio_grade_id",
    "s"."floor",
    "s"."allocation",
    "s"."is_active",
    "ay"."id" AS "academic_year_id",
    "ay"."name" AS "academic_year_name",
        CASE
            WHEN ("s"."status" = 'maintenance'::"public"."studio_status") THEN 'maintenance'::"public"."studio_status"
            WHEN ("s"."allocation" = ANY (ARRAY['OTA'::"text", 'Keyworkers'::"text"])) THEN "s"."status"
            WHEN (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status")))) THEN 'occupied'::"public"."studio_status"
            WHEN (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" = "ay"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status"])) AND (("sa"."reserved_studio_expires_at" IS NULL) OR ("sa"."reserved_studio_expires_at" > "now"()))))) THEN 'reserved'::"public"."studio_status"
            WHEN (("s"."status" = 'reserved'::"public"."studio_status") AND (("s"."reservation_expires_at" IS NULL) OR ("s"."reservation_expires_at" > "now"())) AND (NOT (EXISTS ( SELECT 1
               FROM ("public"."student_applications" "sa"
                 JOIN "public"."contracts" "c" ON (("sa"."contract_id" = "c"."id")))
              WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("c"."academic_year_id" <> "ay"."id") AND ("sa"."status" = ANY (ARRAY['draft'::"public"."application_status", 'awaiting_deposit'::"public"."application_status", 'awaiting_signature'::"public"."application_status", 'awaiting_verification'::"public"."application_status", 'confirmed'::"public"."application_status"]))))))) THEN 'reserved'::"public"."studio_status"
            ELSE 'available'::"public"."studio_status"
        END AS "effective_status",
    "s"."status" AS "global_status",
    "s"."reservation_expires_at"
   FROM ("public"."studios" "s"
     CROSS JOIN "public"."academic_years" "ay")
  WHERE (("s"."is_active" = true) AND ("ay"."is_active" = true));


ALTER VIEW "public"."studio_status_by_academic_year" OWNER TO "postgres";


COMMENT ON VIEW "public"."studio_status_by_academic_year" IS 'Shows the effective status of each studio per academic year. Status is computed based on applications for that specific academic year. Maintenance status is global and takes precedence. Studios allocated to OTA or Keyworkers are excluded from student availability.';



ALTER TABLE ONLY "public"."academic_years"
    ADD CONSTRAINT "academic_years_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."academic_years"
    ADD CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amenities"
    ADD CONSTRAINT "amenities_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."amenities"
    ADD CONSTRAINT "amenities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_cashbacks"
    ADD CONSTRAINT "application_cashbacks_application_id_key" UNIQUE ("application_id");



ALTER TABLE ONLY "public"."application_cashbacks"
    ADD CONSTRAINT "application_cashbacks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branding_settings"
    ADD CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branding_settings"
    ADD CONSTRAINT "branding_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."bulk_messages"
    ADD CONSTRAINT "bulk_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashback_campaigns"
    ADD CONSTRAINT "cashback_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_payment_plans"
    ADD CONSTRAINT "contract_payment_plans_contract_id_payment_plan_id_key" UNIQUE ("contract_id", "payment_plan_id");



ALTER TABLE ONLY "public"."contract_payment_plans"
    ADD CONSTRAINT "contract_payment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_payment_schedule"
    ADD CONSTRAINT "contract_payment_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_credential_key_key" UNIQUE ("credential_key");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."docusign_envelopes"
    ADD CONSTRAINT "docusign_envelopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."docusign_templates"
    ADD CONSTRAINT "docusign_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."docusign_templates"
    ADD CONSTRAINT "docusign_templates_unique_academic_year_type" UNIQUE ("academic_year_id", "template_type");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_forecast_breakdowns"
    ADD CONSTRAINT "financial_forecast_breakdowns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_history"
    ADD CONSTRAINT "import_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_payments"
    ADD CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."navigation_items"
    ADD CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_day_name_key" UNIQUE ("day_name");



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_referrals"
    ADD CONSTRAINT "partner_referrals_application_id_key" UNIQUE ("application_id");



ALTER TABLE ONLY "public"."partner_referrals"
    ADD CONSTRAINT "partner_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."payment_plan_installments"
    ADD CONSTRAINT "payment_plan_installments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_permissions"
    ADD CONSTRAINT "route_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_permissions"
    ADD CONSTRAINT "route_permissions_route_path_role_key" UNIQUE ("route_path", "role");



ALTER TABLE ONLY "public"."social_media_settings"
    ADD CONSTRAINT "social_media_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_media_settings"
    ADD CONSTRAINT "social_media_settings_platform_key" UNIQUE ("platform");



ALTER TABLE ONLY "public"."staff_activity_logs"
    ADD CONSTRAINT "staff_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."student_application_steps"
    ADD CONSTRAINT "student_application_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_signatures"
    ADD CONSTRAINT "student_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grade_amenities"
    ADD CONSTRAINT "studio_grade_amenities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grade_banners"
    ADD CONSTRAINT "studio_grade_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grade_media"
    ADD CONSTRAINT "studio_grade_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grade_prices"
    ADD CONSTRAINT "studio_grade_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grades"
    ADD CONSTRAINT "studio_grades_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."studio_grades"
    ADD CONSTRAINT "studio_grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studio_grades"
    ADD CONSTRAINT "studio_grades_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_unique_number" UNIQUE ("studio_number");



ALTER TABLE ONLY "public"."utility_payments"
    ADD CONSTRAINT "utility_payments_pkey" PRIMARY KEY ("id");



CREATE INDEX "contract_payment_plans_contract_idx" ON "public"."contract_payment_plans" USING "btree" ("contract_id");



CREATE INDEX "contract_payment_plans_plan_idx" ON "public"."contract_payment_plans" USING "btree" ("payment_plan_id");



CREATE UNIQUE INDEX "contract_payment_schedule_unique" ON "public"."contract_payment_schedule" USING "btree" ("contract_id", "sequence");



CREATE INDEX "contracts_grade_idx" ON "public"."contracts" USING "btree" ("studio_grade_id");



CREATE INDEX "docusign_envelopes_application_idx" ON "public"."docusign_envelopes" USING "btree" ("application_id");



CREATE INDEX "docusign_templates_academic_year_idx" ON "public"."docusign_templates" USING "btree" ("academic_year_id", "template_type") WHERE ("is_active" = true);



CREATE INDEX "idx_application_cashbacks_application" ON "public"."application_cashbacks" USING "btree" ("application_id");



CREATE INDEX "idx_application_cashbacks_campaign" ON "public"."application_cashbacks" USING "btree" ("campaign_id");



CREATE INDEX "idx_applications_contract_studio_status" ON "public"."student_applications" USING "btree" ("contract_id", "assigned_studio_id", "status");



CREATE INDEX "idx_applications_previous_app" ON "public"."student_applications" USING "btree" ("previous_application_id") WHERE ("previous_application_id" IS NOT NULL);



CREATE INDEX "idx_applications_rebooking" ON "public"."student_applications" USING "btree" ("is_rebooking", "previous_application_id") WHERE ("is_rebooking" = true);



CREATE INDEX "idx_branding_settings_key" ON "public"."branding_settings" USING "btree" ("setting_key");



CREATE INDEX "idx_bulk_messages_created" ON "public"."bulk_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_bulk_messages_filters_gin" ON "public"."bulk_messages" USING "gin" ("filters");



CREATE INDEX "idx_bulk_messages_status" ON "public"."bulk_messages" USING "btree" ("status");



CREATE INDEX "idx_cashback_campaigns_academic_year" ON "public"."cashback_campaigns" USING "btree" ("academic_year_id") WHERE ("academic_year_id" IS NOT NULL);



CREATE INDEX "idx_cashback_campaigns_active" ON "public"."cashback_campaigns" USING "btree" ("is_active", "start_date", "end_date") WHERE ("is_active" = true);



CREATE INDEX "idx_cashback_campaigns_dates" ON "public"."cashback_campaigns" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_credentials_key" ON "public"."credentials" USING "btree" ("credential_key");



CREATE INDEX "idx_debug_logs_application" ON "public"."debug_logs" USING "btree" ("application_id");



CREATE INDEX "idx_debug_logs_function" ON "public"."debug_logs" USING "btree" ("function_name", "created_at" DESC);



CREATE INDEX "idx_docusign_envelopes_app_status" ON "public"."docusign_envelopes" USING "btree" ("application_id", "status") WHERE ("application_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_docusign_envelopes_app_status" IS 'Composite index for checking envelope status by application';



CREATE INDEX "idx_docusign_envelopes_application_id_verify" ON "public"."docusign_envelopes" USING "btree" ("application_id") WHERE ("application_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_docusign_envelopes_application_id_verify" IS 'Performance index for DocuSign envelope lookups by application_id';



CREATE INDEX "idx_docusign_envelopes_envelope_id" ON "public"."docusign_envelopes" USING "btree" ("envelope_id") WHERE ("envelope_id" IS NOT NULL);



CREATE INDEX "idx_email_templates_active" ON "public"."email_templates" USING "btree" ("is_active");



CREATE INDEX "idx_email_templates_type" ON "public"."email_templates" USING "btree" ("template_type");



CREATE INDEX "idx_financial_forecasts_academic_year" ON "public"."financial_forecasts" USING "btree" ("academic_year_id");



CREATE INDEX "idx_financial_forecasts_created_by" ON "public"."financial_forecasts" USING "btree" ("created_by");



CREATE INDEX "idx_forecast_breakdowns_contract" ON "public"."financial_forecast_breakdowns" USING "btree" ("contract_id");



CREATE INDEX "idx_forecast_breakdowns_forecast" ON "public"."financial_forecast_breakdowns" USING "btree" ("forecast_id");



CREATE INDEX "idx_import_history_created_at" ON "public"."import_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_import_history_imported_by" ON "public"."import_history" USING "btree" ("imported_by");



CREATE INDEX "idx_import_history_status" ON "public"."import_history" USING "btree" ("status");



CREATE INDEX "idx_import_history_type" ON "public"."import_history" USING "btree" ("import_type");



CREATE INDEX "idx_maintenance_requests_academic_year_id" ON "public"."maintenance_requests" USING "btree" ("academic_year_id");



CREATE INDEX "idx_maintenance_requests_application_id" ON "public"."maintenance_requests" USING "btree" ("application_id");



CREATE INDEX "idx_maintenance_requests_created_at" ON "public"."maintenance_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_maintenance_requests_priority" ON "public"."maintenance_requests" USING "btree" ("priority");



CREATE INDEX "idx_maintenance_requests_request_type" ON "public"."maintenance_requests" USING "btree" ("request_type");



CREATE INDEX "idx_maintenance_requests_status" ON "public"."maintenance_requests" USING "btree" ("status");



CREATE INDEX "idx_maintenance_requests_student_id" ON "public"."maintenance_requests" USING "btree" ("student_id");



CREATE INDEX "idx_maintenance_requests_studio_id" ON "public"."maintenance_requests" USING "btree" ("studio_id");



CREATE INDEX "idx_manual_payments_application" ON "public"."manual_payments" USING "btree" ("application_id");



CREATE INDEX "idx_manual_payments_date" ON "public"."manual_payments" USING "btree" ("payment_date");



CREATE INDEX "idx_manual_payments_instalment" ON "public"."manual_payments" USING "btree" ("instalment_id");



CREATE INDEX "idx_manual_payments_invoice_number" ON "public"."manual_payments" USING "btree" ("invoice_number") WHERE ("invoice_number" IS NOT NULL);



CREATE INDEX "idx_manual_payments_orphaned" ON "public"."manual_payments" USING "btree" ("receipt_number", "payment_date", "payment_type") WHERE ("application_id" IS NULL);



CREATE UNIQUE INDEX "idx_manual_payments_receipt_number_unique" ON "public"."manual_payments" USING "btree" ("receipt_number") WHERE ("receipt_number" IS NOT NULL);



CREATE UNIQUE INDEX "idx_manual_payments_receipt_number_unique_verify" ON "public"."manual_payments" USING "btree" ("receipt_number") WHERE ("receipt_number" IS NOT NULL);



CREATE INDEX "idx_manual_payments_student_date" ON "public"."manual_payments" USING "btree" ("application_id", "payment_date" DESC);



CREATE INDEX "idx_navigation_items_location" ON "public"."navigation_items" USING "btree" ("location", "is_active");



CREATE INDEX "idx_navigation_items_order" ON "public"."navigation_items" USING "btree" ("location", "display_order");



CREATE INDEX "idx_notifications_created" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_login_dialog_shown" ON "public"."notifications" USING "btree" ("user_id", "login_dialog_shown", "is_read") WHERE (("login_dialog_shown" = false) AND ("is_read" = false));



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_notifications_starred" ON "public"."notifications" USING "btree" ("is_starred");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING "btree" ("user_id", "read_at") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_opening_hours_order" ON "public"."opening_hours" USING "btree" ("day_order");



CREATE INDEX "idx_partner_referrals_application" ON "public"."partner_referrals" USING "btree" ("application_id");



CREATE INDEX "idx_partner_referrals_partner" ON "public"."partner_referrals" USING "btree" ("partner_id");



CREATE INDEX "idx_partner_referrals_status" ON "public"."partner_referrals" USING "btree" ("commission_status");



CREATE INDEX "idx_partners_active" ON "public"."partners" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_partners_referral_code" ON "public"."partners" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "idx_profiles_partner_id" ON "public"."profiles" USING "btree" ("partner_id") WHERE ("partner_id" IS NOT NULL);



CREATE INDEX "idx_profiles_staff_subrole" ON "public"."profiles" USING "btree" ("staff_subrole") WHERE ("staff_subrole" IS NOT NULL);



CREATE INDEX "idx_refunds_application" ON "public"."refunds" USING "btree" ("application_id");



CREATE INDEX "idx_refunds_manual_reference" ON "public"."refunds" USING "btree" ("manual_refund_reference") WHERE ("manual_refund_reference" IS NOT NULL);



CREATE INDEX "idx_refunds_payment_intent" ON "public"."refunds" USING "btree" ("payment_intent_id");



CREATE INDEX "idx_refunds_processed_at" ON "public"."refunds" USING "btree" ("processed_at" DESC);



CREATE INDEX "idx_refunds_refund_source" ON "public"."refunds" USING "btree" ("refund_source");



CREATE INDEX "idx_refunds_status" ON "public"."refunds" USING "btree" ("status");



CREATE INDEX "idx_refunds_stripe_refund_id" ON "public"."refunds" USING "btree" ("stripe_refund_id");



CREATE INDEX "idx_refunds_student" ON "public"."refunds" USING "btree" ("student_id");



CREATE INDEX "idx_route_permissions_allowed" ON "public"."route_permissions" USING "btree" ("allowed") WHERE ("allowed" = true);



CREATE INDEX "idx_route_permissions_role" ON "public"."route_permissions" USING "btree" ("role");



CREATE INDEX "idx_route_permissions_route_path" ON "public"."route_permissions" USING "btree" ("route_path");



CREATE INDEX "idx_stripe_payments_application" ON "public"."stripe_payments" USING "btree" ("student_application_id");



CREATE INDEX "idx_stripe_payments_application_status" ON "public"."stripe_payments" USING "btree" ("student_application_id", "status") WHERE ("status" = ANY (ARRAY['succeeded'::"text", 'completed'::"text"]));



CREATE INDEX "idx_stripe_payments_created" ON "public"."stripe_payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_stripe_payments_customer_id" ON "public"."stripe_payments" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_stripe_payments_intent" ON "public"."stripe_payments" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_stripe_payments_invoice_number" ON "public"."stripe_payments" USING "btree" ("invoice_number") WHERE ("invoice_number" IS NOT NULL);



CREATE INDEX "idx_stripe_payments_status" ON "public"."stripe_payments" USING "btree" ("status");



CREATE INDEX "idx_student_applications_cashback" ON "public"."student_applications" USING "btree" ("cashback_amount") WHERE ("cashback_amount" > (0)::numeric);



CREATE INDEX "idx_student_applications_check_in_date" ON "public"."student_applications" USING "btree" ("actual_check_in_date") WHERE ("actual_check_in_date" IS NOT NULL);



CREATE INDEX "idx_student_applications_check_out_date" ON "public"."student_applications" USING "btree" ("actual_check_out_date") WHERE ("actual_check_out_date" IS NOT NULL);



CREATE INDEX "idx_student_applications_contract_id_verify" ON "public"."student_applications" USING "btree" ("contract_id") WHERE ("contract_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_student_applications_contract_id_verify" IS 'Performance index for student application lookups by contract_id';



CREATE INDEX "idx_student_applications_partner" ON "public"."student_applications" USING "btree" ("referred_by_partner_id");



CREATE INDEX "idx_student_applications_referral_code" ON "public"."student_applications" USING "btree" ("validated_referral_code") WHERE ("validated_referral_code" IS NOT NULL);



CREATE INDEX "idx_student_applications_status" ON "public"."student_applications" USING "btree" ("status") WHERE ("status" = 'confirmed'::"public"."application_status");



CREATE INDEX "idx_student_applications_status_academic_year" ON "public"."student_applications" USING "btree" ("status", "contract_id") WHERE ("status" IS NOT NULL);



COMMENT ON INDEX "public"."idx_student_applications_status_academic_year" IS 'Composite index for filtering applications by status and contract (academic year)';



CREATE INDEX "idx_student_applications_student_id_verify" ON "public"."student_applications" USING "btree" ("student_id") WHERE ("student_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_student_applications_student_id_verify" IS 'Performance index for student application lookups by student_id';



CREATE INDEX "idx_student_applications_submitted_at" ON "public"."student_applications" USING "btree" ("submitted_at" DESC) WHERE ("submitted_at" IS NOT NULL);



CREATE INDEX "idx_studios_allocation" ON "public"."studios" USING "btree" ("allocation") WHERE ("allocation" IS NOT NULL);



CREATE INDEX "idx_studios_allocation_status" ON "public"."studios" USING "btree" ("allocation", "status") WHERE ("allocation" IS NOT NULL);



CREATE INDEX "idx_studios_grade_status_active" ON "public"."studios" USING "btree" ("studio_grade_id", "status", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_unified_payments_student_date" ON "public"."stripe_payments" USING "btree" ("student_application_id", "created_at" DESC);



CREATE INDEX "idx_utility_payments_academic_year_id" ON "public"."utility_payments" USING "btree" ("academic_year_id");



CREATE INDEX "idx_utility_payments_category" ON "public"."utility_payments" USING "btree" ("expense_category");



CREATE INDEX "idx_utility_payments_created_at" ON "public"."utility_payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_utility_payments_payment_date" ON "public"."utility_payments" USING "btree" ("payment_date" DESC);



CREATE INDEX "notifications_user_idx" ON "public"."notifications" USING "btree" ("user_id");



CREATE UNIQUE INDEX "payment_plan_installments_unique_seq" ON "public"."payment_plan_installments" USING "btree" ("payment_plan_id", "sequence");



CREATE INDEX "payment_plans_year_idx" ON "public"."payment_plans" USING "btree" ("academic_year_id");



CREATE UNIQUE INDEX "refunds_stripe_refund_id_unique" ON "public"."refunds" USING "btree" ("stripe_refund_id") WHERE ("stripe_refund_id" IS NOT NULL);



CREATE UNIQUE INDEX "student_application_steps_unique" ON "public"."student_application_steps" USING "btree" ("application_id", "step_number");



CREATE INDEX "student_applications_contract_idx" ON "public"."student_applications" USING "btree" ("contract_id");



CREATE INDEX "student_applications_student_idx" ON "public"."student_applications" USING "btree" ("student_id");



CREATE INDEX "student_documents_application_idx" ON "public"."student_documents" USING "btree" ("application_id");



CREATE UNIQUE INDEX "studio_grade_amenities_unique" ON "public"."studio_grade_amenities" USING "btree" ("studio_grade_id", "amenity_id");



CREATE INDEX "studio_grade_banners_order_idx" ON "public"."studio_grade_banners" USING "btree" ("studio_grade_id", "display_order");



CREATE UNIQUE INDEX "studio_grade_media_single_hero" ON "public"."studio_grade_media" USING "btree" ("studio_grade_id") WHERE "is_hero";



CREATE UNIQUE INDEX "studio_grade_media_unique_position" ON "public"."studio_grade_media" USING "btree" ("studio_grade_id", "media_type", "position");



CREATE UNIQUE INDEX "studio_grade_prices_unique" ON "public"."studio_grade_prices" USING "btree" ("academic_year_id", "studio_grade_id");



CREATE INDEX "studios_grade_idx" ON "public"."studios" USING "btree" ("studio_grade_id");



CREATE OR REPLACE VIEW "public"."studio_allocation_report" AS
 SELECT "sg"."id" AS "studio_grade_id",
    "sg"."name" AS "studio_grade_name",
    "sg"."slug" AS "studio_grade_slug",
    "count"(*) AS "total_studios",
    "count"(*) FILTER (WHERE ("s"."is_active" = true)) AS "active_studios",
    "count"(*) FILTER (WHERE (("s"."allocation" = 'Student'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."student_applications" "sa"
          WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status")))))) AS "allocated_to_students",
    "count"(*) FILTER (WHERE ("s"."allocation" = 'OTA'::"text")) AS "allocated_to_ota",
    "count"(*) FILTER (WHERE ("s"."allocation" = 'Keyworkers'::"text")) AS "allocated_to_keyworkers",
    "count"(*) FILTER (WHERE ((("s"."allocation" IS NULL) OR ("s"."allocation" = ''::"text")) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."student_applications" "sa"
          WHERE (("sa"."assigned_studio_id" = "s"."id") AND ("sa"."status" = 'confirmed'::"public"."application_status"))))))) AS "unallocated",
    "count"(*) FILTER (WHERE ("s"."status" = 'available'::"public"."studio_status")) AS "status_available",
    "count"(*) FILTER (WHERE ("s"."status" = 'occupied'::"public"."studio_status")) AS "status_occupied",
    "count"(*) FILTER (WHERE ("s"."status" = 'reserved'::"public"."studio_status")) AS "status_reserved",
    "count"(*) FILTER (WHERE ("s"."status" = 'maintenance'::"public"."studio_status")) AS "status_maintenance"
   FROM ("public"."studio_grades" "sg"
     LEFT JOIN "public"."studios" "s" ON (("s"."studio_grade_id" = "sg"."id")))
  WHERE ("sg"."is_active" = true)
  GROUP BY "sg"."id", "sg"."name", "sg"."slug"
  ORDER BY "sg"."display_order", "sg"."name";



CREATE OR REPLACE TRIGGER "application_confirmation_trigger" AFTER UPDATE OF "status" ON "public"."student_applications" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."handle_application_confirmation"();



CREATE OR REPLACE TRIGGER "maintenance_requests_updated_at" BEFORE UPDATE ON "public"."maintenance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_maintenance_requests_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_academic_years" BEFORE UPDATE ON "public"."academic_years" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_amenities" BEFORE UPDATE ON "public"."amenities" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_application_cashbacks" BEFORE UPDATE ON "public"."application_cashbacks" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_branding_settings" BEFORE UPDATE ON "public"."branding_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_cashback_campaigns" BEFORE UPDATE ON "public"."cashback_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_contract_payment_plans" BEFORE UPDATE ON "public"."contract_payment_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_contract_payment_schedule" BEFORE UPDATE ON "public"."contract_payment_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_contracts" BEFORE UPDATE ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_credentials" BEFORE UPDATE ON "public"."credentials" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_docusign_envelopes" BEFORE UPDATE ON "public"."docusign_envelopes" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_docusign_templates" BEFORE UPDATE ON "public"."docusign_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_email_templates" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_financial_forecasts" BEFORE UPDATE ON "public"."financial_forecasts" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_manual_payments" BEFORE UPDATE ON "public"."manual_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_navigation_items" BEFORE UPDATE ON "public"."navigation_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_opening_hours" BEFORE UPDATE ON "public"."opening_hours" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_partner_referrals" BEFORE UPDATE ON "public"."partner_referrals" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_partners" BEFORE UPDATE ON "public"."partners" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_payment_plan_installments" BEFORE UPDATE ON "public"."payment_plan_installments" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_payment_plans" BEFORE UPDATE ON "public"."payment_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_refunds" BEFORE UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_social_media_settings" BEFORE UPDATE ON "public"."social_media_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_stripe_payments" BEFORE UPDATE ON "public"."stripe_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_student_application_steps" BEFORE UPDATE ON "public"."student_application_steps" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_student_applications" BEFORE UPDATE ON "public"."student_applications" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_student_documents" BEFORE UPDATE ON "public"."student_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_student_signatures" BEFORE UPDATE ON "public"."student_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studio_grade_amenities" BEFORE UPDATE ON "public"."studio_grade_amenities" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studio_grade_banners" BEFORE UPDATE ON "public"."studio_grade_banners" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studio_grade_media" BEFORE UPDATE ON "public"."studio_grade_media" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studio_grade_prices" BEFORE UPDATE ON "public"."studio_grade_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studio_grades" BEFORE UPDATE ON "public"."studio_grades" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_studios" BEFORE UPDATE ON "public"."studios" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_auto_apply_cashback" AFTER UPDATE OF "status" ON "public"."student_applications" FOR EACH ROW WHEN (("new"."status" = 'confirmed'::"public"."application_status")) EXECUTE FUNCTION "public"."auto_apply_cashback_on_confirmation"();



CREATE OR REPLACE TRIGGER "trigger_auto_create_partner_referral" AFTER UPDATE OF "status" ON "public"."student_applications" FOR EACH ROW WHEN ((("new"."status" = 'confirmed'::"public"."application_status") AND (("new"."referred_by_partner_id" IS NOT NULL) OR ("new"."validated_referral_code" IS NOT NULL)))) EXECUTE FUNCTION "public"."auto_create_partner_referral_on_confirmation"();



COMMENT ON TRIGGER "trigger_auto_create_partner_referral" ON "public"."student_applications" IS 'Automatically creates partner referral record when application with referral code or partner_id is confirmed';



CREATE OR REPLACE TRIGGER "trigger_set_application_contract_value" BEFORE INSERT OR UPDATE OF "contract_id" ON "public"."student_applications" FOR EACH ROW EXECUTE FUNCTION "public"."set_application_contract_value"();



CREATE OR REPLACE TRIGGER "utility_payments_updated_at" BEFORE UPDATE ON "public"."utility_payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_utility_payments_updated_at"();



ALTER TABLE ONLY "public"."application_cashbacks"
    ADD CONSTRAINT "application_cashbacks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_cashbacks"
    ADD CONSTRAINT "application_cashbacks_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."application_cashbacks"
    ADD CONSTRAINT "application_cashbacks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."cashback_campaigns"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bulk_messages"
    ADD CONSTRAINT "bulk_messages_email_template_id_fkey" FOREIGN KEY ("email_template_id") REFERENCES "public"."email_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bulk_messages"
    ADD CONSTRAINT "bulk_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cashback_campaigns"
    ADD CONSTRAINT "cashback_campaigns_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cashback_campaigns"
    ADD CONSTRAINT "cashback_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contract_payment_plans"
    ADD CONSTRAINT "contract_payment_plans_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_payment_plans"
    ADD CONSTRAINT "contract_payment_plans_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_payment_schedule"
    ADD CONSTRAINT "contract_payment_schedule_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docusign_envelopes"
    ADD CONSTRAINT "docusign_envelopes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docusign_templates"
    ADD CONSTRAINT "docusign_templates_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."docusign_templates"
    ADD CONSTRAINT "docusign_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_forecast_breakdowns"
    ADD CONSTRAINT "financial_forecast_breakdowns_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecast_breakdowns"
    ADD CONSTRAINT "financial_forecast_breakdowns_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."financial_forecasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecast_breakdowns"
    ADD CONSTRAINT "financial_forecast_breakdowns_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_forecasts"
    ADD CONSTRAINT "financial_forecasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."import_history"
    ADD CONSTRAINT "import_history_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_payments"
    ADD CONSTRAINT "manual_payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_payments"
    ADD CONSTRAINT "manual_payments_instalment_id_fkey" FOREIGN KEY ("instalment_id") REFERENCES "public"."contract_payment_schedule"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_payments"
    ADD CONSTRAINT "manual_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_referrals"
    ADD CONSTRAINT "partner_referrals_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_referrals"
    ADD CONSTRAINT "partner_referrals_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."partner_referrals"
    ADD CONSTRAINT "partner_referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_plan_installments"
    ADD CONSTRAINT "payment_plan_installments_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_activity_logs"
    ADD CONSTRAINT "staff_activity_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payments"
    ADD CONSTRAINT "stripe_payments_student_application_id_fkey" FOREIGN KEY ("student_application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_application_steps"
    ADD CONSTRAINT "student_application_steps_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_assigned_studio_id_fkey" FOREIGN KEY ("assigned_studio_id") REFERENCES "public"."studios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_previous_application_id_fkey" FOREIGN KEY ("previous_application_id") REFERENCES "public"."student_applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_rebooking_approved_by_fkey" FOREIGN KEY ("rebooking_approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_referred_by_partner_id_fkey" FOREIGN KEY ("referred_by_partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_selected_payment_plan_id_fkey" FOREIGN KEY ("selected_payment_plan_id") REFERENCES "public"."payment_plans"("id");



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_applications"
    ADD CONSTRAINT "student_applications_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_signatures"
    ADD CONSTRAINT "student_signatures_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_amenities"
    ADD CONSTRAINT "studio_grade_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_amenities"
    ADD CONSTRAINT "studio_grade_amenities_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_banners"
    ADD CONSTRAINT "studio_grade_banners_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_media"
    ADD CONSTRAINT "studio_grade_media_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_prices"
    ADD CONSTRAINT "studio_grade_prices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studio_grade_prices"
    ADD CONSTRAINT "studio_grade_prices_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studios"
    ADD CONSTRAINT "studios_studio_grade_id_fkey" FOREIGN KEY ("studio_grade_id") REFERENCES "public"."studio_grades"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."utility_payments"
    ADD CONSTRAINT "utility_payments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."utility_payments"
    ADD CONSTRAINT "utility_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."utility_payments"
    ADD CONSTRAINT "utility_payments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Authenticated users can view route permissions" ON "public"."route_permissions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Partners can update own profile" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) AND ("role" = 'partner'::"text"))) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = 'partner'::"text")));



CREATE POLICY "Partners can view own partner record" ON "public"."partners" FOR SELECT USING (("id" = "public"."get_partner_id"()));



CREATE POLICY "Partners can view own profile" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_partner"()));



CREATE POLICY "Partners can view own referrals" ON "public"."partner_referrals" FOR SELECT USING (("partner_id" = "public"."get_partner_id"()));



CREATE POLICY "Public can read active navigation items" ON "public"."navigation_items" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can read branding settings" ON "public"."branding_settings" FOR SELECT USING (true);



CREATE POLICY "Public can read opening hours" ON "public"."opening_hours" FOR SELECT USING (true);



CREATE POLICY "Public read academic years" ON "public"."academic_years" FOR SELECT USING (true);



CREATE POLICY "Public read active templates" ON "public"."docusign_templates" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public read amenities" ON "public"."amenities" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read contract payment plans" ON "public"."contract_payment_plans" FOR SELECT USING (true);



CREATE POLICY "Public read contract schedule" ON "public"."contract_payment_schedule" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read contracts" ON "public"."contracts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read grade banners" ON "public"."studio_grade_banners" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read grade prices" ON "public"."studio_grade_prices" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read payment plans" ON "public"."payment_plans" FOR SELECT USING (true);



CREATE POLICY "Public read plan installments" ON "public"."payment_plan_installments" FOR SELECT USING (true);



CREATE POLICY "Public read social media settings" ON "public"."social_media_settings" FOR SELECT USING (true);



CREATE POLICY "Public read studio grade amenities" ON "public"."studio_grade_amenities" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read studio grades" ON "public"."studio_grades" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read studio media" ON "public"."studio_grade_media" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read studios" ON "public"."studios" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "Staff can insert email templates" ON "public"."email_templates" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can insert refunds" ON "public"."refunds" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can insert stripe payments" ON "public"."stripe_payments" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage branding" ON "public"."branding_settings" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage cashback campaigns" ON "public"."cashback_campaigns" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage email templates" ON "public"."email_templates" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage envelopes" ON "public"."docusign_envelopes" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage manual payments" ON "public"."manual_payments" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage navigation items" ON "public"."navigation_items" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage opening hours" ON "public"."opening_hours" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage partner referrals" ON "public"."partner_referrals" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage partners" ON "public"."partners" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage payment plans" ON "public"."payment_plans" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage route permissions" ON "public"."route_permissions" USING (("public"."is_staff"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))))) WITH CHECK (("public"."is_staff"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



CREATE POLICY "Staff can update stripe payments" ON "public"."stripe_payments" FOR UPDATE USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can view all cashback campaigns" ON "public"."cashback_campaigns" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all email templates" ON "public"."email_templates" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all notifications" ON "public"."notifications" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all partner referrals" ON "public"."partner_referrals" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all partners" ON "public"."partners" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all refunds" ON "public"."refunds" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff can view all stripe payments" ON "public"."stripe_payments" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Staff insert activity logs" ON "public"."staff_activity_logs" FOR INSERT TO "authenticated" WITH CHECK ((("staff_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'superadmin'::"text"])))))));



CREATE POLICY "Staff manage academic years" ON "public"."academic_years" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage all requests" ON "public"."maintenance_requests" USING ("public"."is_staff"());



CREATE POLICY "Staff manage applications" ON "public"."student_applications" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage bulk messages" ON "public"."bulk_messages" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage contract payment plans" ON "public"."contract_payment_plans" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage contracts" ON "public"."contracts" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage documents" ON "public"."student_documents" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage forecast breakdowns" ON "public"."financial_forecast_breakdowns" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage forecasts" ON "public"."financial_forecasts" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage profiles" ON "public"."profiles" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage steps" ON "public"."student_application_steps" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage studios" ON "public"."studios" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff manage utility payments" ON "public"."utility_payments" USING ("public"."is_staff"());



CREATE POLICY "Staff read activity logs" ON "public"."staff_activity_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'superadmin'::"text"]))))));



CREATE POLICY "Staff view forecast breakdowns" ON "public"."financial_forecast_breakdowns" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "Students can view active cashback campaigns" ON "public"."cashback_campaigns" FOR SELECT USING ((("is_active" = true) AND ("start_date" <= CURRENT_DATE) AND ("end_date" >= CURRENT_DATE)));



CREATE POLICY "Students can view own envelopes" ON "public"."docusign_envelopes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "docusign_envelopes"."application_id") AND (("a"."student_id" = "auth"."uid"()) OR "public"."is_staff"())))));



CREATE POLICY "Students can view their own application cashback" ON "public"."application_cashbacks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "sa"
  WHERE (("sa"."id" = "application_cashbacks"."application_id") AND ("sa"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students can view their own partner referral" ON "public"."partner_referrals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "sa"
  WHERE (("sa"."id" = "partner_referrals"."application_id") AND ("sa"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students insert applications" ON "public"."student_applications" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students insert documents" ON "public"."student_documents" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_documents"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students insert signatures" ON "public"."student_signatures" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_signatures"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students insert steps" ON "public"."student_application_steps" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_application_steps"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students manage own applications" ON "public"."student_applications" FOR SELECT TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "Students manage own documents" ON "public"."student_documents" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_documents"."application_id") AND ("a"."student_id" = "auth"."uid"())))) OR "public"."is_staff"()));



CREATE POLICY "Students manage own requests" ON "public"."maintenance_requests" USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students manage own steps" ON "public"."student_application_steps" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_application_steps"."application_id") AND ("a"."student_id" = "auth"."uid"())))) OR "public"."is_staff"()));



CREATE POLICY "Students reserve studios" ON "public"."studios" FOR UPDATE TO "authenticated" USING ((("status" = 'available'::"public"."studio_status") OR ("allocation" = ("auth"."uid"())::"text"))) WITH CHECK (((("status" = 'reserved'::"public"."studio_status") AND ("allocation" = ("auth"."uid"())::"text")) OR (("status" = 'available'::"public"."studio_status") AND ("allocation" IS NULL))));



CREATE POLICY "Students update documents" ON "public"."student_documents" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_documents"."application_id") AND ("a"."student_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_documents"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students update own applications" ON "public"."student_applications" FOR UPDATE TO "authenticated" USING ((("student_id" = "auth"."uid"()) OR "public"."is_staff"())) WITH CHECK ((("student_id" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "Students update steps" ON "public"."student_application_steps" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_application_steps"."application_id") AND ("a"."student_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "student_application_steps"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view own Stripe payments" ON "public"."stripe_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "stripe_payments"."student_application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view own manual payments" ON "public"."manual_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."student_applications" "a"
  WHERE (("a"."id" = "manual_payments"."application_id") AND ("a"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view own refunds" ON "public"."refunds" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Users read own profile" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_staff"()));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_staff"())) WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_staff"()));



CREATE POLICY "Users view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."academic_years" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."amenities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."application_cashbacks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branding_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulk_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cashback_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_payment_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_payment_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."docusign_envelopes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."docusign_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_forecast_breakdowns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_forecasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."navigation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opening_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partner_referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_plan_installments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."route_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_media_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_application_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studio_grade_amenities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studio_grade_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studio_grade_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studio_grade_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studio_grades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."utility_payments" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."apply_cashback_to_application"("p_application_id" "uuid", "p_campaign_id" "uuid", "p_applied_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_cashback_to_application"("p_application_id" "uuid", "p_campaign_id" "uuid", "p_applied_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_cashback_to_application"("p_application_id" "uuid", "p_campaign_id" "uuid", "p_applied_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_apply_cashback_on_confirmation"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_apply_cashback_on_confirmation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_apply_cashback_on_confirmation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_partner_referral_on_confirmation"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_partner_referral_on_confirmation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_partner_referral_on_confirmation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_academic_years"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_cashback_campaigns"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_contracts"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_partners"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_payment_plan_installments"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_payment_plans"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_student_applications"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_studio_grade_prices"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_studio_grades"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_import_studios"("p_data" "jsonb", "p_imported_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_contract_value"("p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_contract_value"("p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_contract_value"("p_contract_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_partner_commission"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_partner_commission"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_partner_commission"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_route"("p_route_path" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_route"("p_route_path" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_route"("p_route_path" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_student_rebook"("p_user_id" "uuid", "p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_student_rebook"("p_user_id" "uuid", "p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_student_rebook"("p_user_id" "uuid", "p_contract_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_cashback_eligibility"("p_application_id" "uuid", "p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_cashback_eligibility"("p_application_id" "uuid", "p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_cashback_eligibility"("p_application_id" "uuid", "p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_referral_code_available"("p_referral_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_partner_referral"("p_application_id" "uuid", "p_partner_id" "uuid", "p_referral_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_partner_referral"("p_application_id" "uuid", "p_partner_id" "uuid", "p_referral_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_partner_referral"("p_application_id" "uuid", "p_partner_id" "uuid", "p_referral_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_payment_summary"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."debug_payment_summary"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_payment_summary"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_all_student_applications"("p_delete_orphaned_users" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_student_application"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_student_application"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_student_application"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_student_applications_by_academic_year"("p_academic_year_id" "uuid", "p_delete_orphaned_users" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_enums"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_enums"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_enums"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_functions"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_functions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_functions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_grants"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_grants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_grants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_indexes"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_indexes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_indexes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_rls_policies"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_rls_policies"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_rls_policies"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_tables"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_tables"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_tables"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_triggers"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_triggers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_triggers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_get_views"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_get_views"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_get_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_user_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_user_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_user_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"("p_academic_year_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"("p_academic_year_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"("p_academic_year_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_application_total_with_cashback"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_application_total_with_cashback"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_application_total_with_cashback"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text", "p_studio_grade_id" "uuid", "p_academic_year_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text", "p_studio_grade_id" "uuid", "p_academic_year_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_booking_calendar_data"("p_allocation" "text", "p_studio_grade_id" "uuid", "p_academic_year_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contract_value"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_contract_value"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contract_value"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_debug_logs"("p_function_name" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_debug_logs"("p_function_name" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_debug_logs"("p_function_name" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid", "p_academic_year_id" "uuid", "p_start_date" "text", "p_end_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid", "p_academic_year_id" "uuid", "p_start_date" "text", "p_end_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fully_paid_students"("p_contract_id" "uuid", "p_academic_year_id" "uuid", "p_start_date" "text", "p_end_date" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_partner_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_partner_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_partner_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_partner_referral_payment_summary"("p_partner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_summary"("p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rebooking_data"("p_previous_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rebooking_data"("p_previous_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rebooking_data"("p_previous_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_revenue_summary"("p_start_date" "date", "p_end_date" "date", "p_group_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_revenue_summary"("p_start_date" "date", "p_end_date" "date", "p_group_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_revenue_summary"("p_start_date" "date", "p_end_date" "date", "p_group_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_route_permissions_for_role"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_route_permissions_for_role"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_route_permissions_for_role"("p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_staff_subrole"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_staff_subrole"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_staff_subrole"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_studio_availability"("p_studio_grade_id" "uuid", "p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_studio_availability"("p_studio_grade_id" "uuid", "p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_studio_availability"("p_studio_grade_id" "uuid", "p_contract_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_with_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_with_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_with_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_application_confirmation"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_application_confirmation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_application_confirmation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_partner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_partner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_partner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_partner_account"("p_referral_code" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_partner_account"("p_referral_code" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_partner_account"("p_referral_code" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_payment_to_application"("p_receipt_number" "text", "p_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_staff_activity"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_staff_activity"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_staff_activity"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_application_contract_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_application_contract_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_application_contract_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."student_applications" TO "anon";
GRANT ALL ON TABLE "public"."student_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."student_applications" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_selected_payment_plan"("p_application_id" "uuid", "p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_email" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_password_by_id"("p_user_id" "uuid", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_release_expired_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_release_expired_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_release_expired_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_maintenance_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_maintenance_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_maintenance_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_utility_payments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_utility_payments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_utility_payments_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_referral_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_referral_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_referral_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_payment_by_receipt"("p_receipt_number" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."academic_years" TO "anon";
GRANT ALL ON TABLE "public"."academic_years" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_years" TO "service_role";



GRANT ALL ON TABLE "public"."application_cashbacks" TO "anon";
GRANT ALL ON TABLE "public"."application_cashbacks" TO "authenticated";
GRANT ALL ON TABLE "public"."application_cashbacks" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grades" TO "anon";
GRANT ALL ON TABLE "public"."studio_grades" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grades" TO "service_role";



GRANT ALL ON TABLE "public"."studios" TO "anon";
GRANT ALL ON TABLE "public"."studios" TO "authenticated";
GRANT ALL ON TABLE "public"."studios" TO "service_role";



GRANT ALL ON TABLE "public"."accounts_receivable_report" TO "anon";
GRANT ALL ON TABLE "public"."accounts_receivable_report" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts_receivable_report" TO "service_role";



GRANT ALL ON TABLE "public"."amenities" TO "anon";
GRANT ALL ON TABLE "public"."amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."amenities" TO "service_role";



GRANT ALL ON TABLE "public"."contract_payment_schedule" TO "anon";
GRANT ALL ON TABLE "public"."contract_payment_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_payment_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."manual_payments" TO "anon";
GRANT ALL ON TABLE "public"."manual_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_payments" TO "service_role";



GRANT ALL ON TABLE "public"."payment_plan_installments" TO "anon";
GRANT ALL ON TABLE "public"."payment_plan_installments" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_plan_installments" TO "service_role";



GRANT ALL ON TABLE "public"."payment_plans" TO "anon";
GRANT ALL ON TABLE "public"."payment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_plans" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_payments" TO "anon";
GRANT ALL ON TABLE "public"."stripe_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_payments" TO "service_role";



GRANT ALL ON TABLE "public"."unified_payment_history" TO "anon";
GRANT ALL ON TABLE "public"."unified_payment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."unified_payment_history" TO "service_role";



GRANT ALL ON TABLE "public"."bank_reconciliation_report" TO "anon";
GRANT ALL ON TABLE "public"."bank_reconciliation_report" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_reconciliation_report" TO "service_role";



GRANT ALL ON TABLE "public"."student_application_steps" TO "anon";
GRANT ALL ON TABLE "public"."student_application_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."student_application_steps" TO "service_role";



GRANT ALL ON TABLE "public"."booking_calendar_data" TO "anon";
GRANT ALL ON TABLE "public"."booking_calendar_data" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_calendar_data" TO "service_role";



GRANT ALL ON TABLE "public"."branding_settings" TO "anon";
GRANT ALL ON TABLE "public"."branding_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."branding_settings" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_messages" TO "anon";
GRANT ALL ON TABLE "public"."bulk_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_messages" TO "service_role";



GRANT ALL ON TABLE "public"."cashback_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."cashback_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."cashback_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."contract_payment_plans" TO "anon";
GRANT ALL ON TABLE "public"."contract_payment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_payment_plans" TO "service_role";



GRANT ALL ON TABLE "public"."credentials" TO "anon";
GRANT ALL ON TABLE "public"."credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."credentials" TO "service_role";



GRANT ALL ON TABLE "public"."debug_logs" TO "anon";
GRANT ALL ON TABLE "public"."debug_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_logs" TO "service_role";



GRANT ALL ON TABLE "public"."debug_policies" TO "anon";
GRANT ALL ON TABLE "public"."debug_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_policies" TO "service_role";



GRANT ALL ON TABLE "public"."deposit_installment_breakdown" TO "anon";
GRANT ALL ON TABLE "public"."deposit_installment_breakdown" TO "authenticated";
GRANT ALL ON TABLE "public"."deposit_installment_breakdown" TO "service_role";



GRANT ALL ON TABLE "public"."docusign_envelopes" TO "anon";
GRANT ALL ON TABLE "public"."docusign_envelopes" TO "authenticated";
GRANT ALL ON TABLE "public"."docusign_envelopes" TO "service_role";



GRANT ALL ON TABLE "public"."docusign_templates" TO "anon";
GRANT ALL ON TABLE "public"."docusign_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."docusign_templates" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."utility_payments" TO "anon";
GRANT ALL ON TABLE "public"."utility_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."utility_payments" TO "service_role";



GRANT ALL ON TABLE "public"."expense_summary_by_academic_year" TO "anon";
GRANT ALL ON TABLE "public"."expense_summary_by_academic_year" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_summary_by_academic_year" TO "service_role";



GRANT ALL ON TABLE "public"."financial_forecast_breakdowns" TO "anon";
GRANT ALL ON TABLE "public"."financial_forecast_breakdowns" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_forecast_breakdowns" TO "service_role";



GRANT ALL ON TABLE "public"."financial_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."financial_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."fully_paid_students" TO "anon";
GRANT ALL ON TABLE "public"."fully_paid_students" TO "authenticated";
GRANT ALL ON TABLE "public"."fully_paid_students" TO "service_role";



GRANT ALL ON TABLE "public"."import_history" TO "anon";
GRANT ALL ON TABLE "public"."import_history" TO "authenticated";
GRANT ALL ON TABLE "public"."import_history" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_requests" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."navigation_items" TO "anon";
GRANT ALL ON TABLE "public"."navigation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."navigation_items" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."opening_hours" TO "anon";
GRANT ALL ON TABLE "public"."opening_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."opening_hours" TO "service_role";



GRANT ALL ON TABLE "public"."outstanding_balances_report" TO "anon";
GRANT ALL ON TABLE "public"."outstanding_balances_report" TO "authenticated";
GRANT ALL ON TABLE "public"."outstanding_balances_report" TO "service_role";



GRANT ALL ON TABLE "public"."partner_referrals" TO "anon";
GRANT ALL ON TABLE "public"."partner_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."partner_referred_applications" TO "anon";
GRANT ALL ON TABLE "public"."partner_referred_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_referred_applications" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."route_permissions" TO "anon";
GRANT ALL ON TABLE "public"."route_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."route_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."social_media_settings" TO "anon";
GRANT ALL ON TABLE "public"."social_media_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."social_media_settings" TO "service_role";



GRANT ALL ON TABLE "public"."staff_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."staff_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."student_documents" TO "anon";
GRANT ALL ON TABLE "public"."student_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."student_documents" TO "service_role";



GRANT ALL ON TABLE "public"."student_signatures" TO "anon";
GRANT ALL ON TABLE "public"."student_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."student_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."studio_allocation_report" TO "anon";
GRANT ALL ON TABLE "public"."studio_allocation_report" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_allocation_report" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_amenities" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_amenities" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_availability" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_availability" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_availability_by_year" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_availability_by_year" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_availability_by_year" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_availability_summary" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_availability_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_availability_summary" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_banners" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_banners" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_media" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_media" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_media" TO "service_role";



GRANT ALL ON TABLE "public"."studio_grade_prices" TO "anon";
GRANT ALL ON TABLE "public"."studio_grade_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_grade_prices" TO "service_role";



GRANT ALL ON TABLE "public"."studio_status_by_academic_year" TO "anon";
GRANT ALL ON TABLE "public"."studio_status_by_academic_year" TO "authenticated";
GRANT ALL ON TABLE "public"."studio_status_by_academic_year" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































