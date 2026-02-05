-- Bulk import discount campaigns (mirror bulk_import_cashback_campaigns)

CREATE OR REPLACE FUNCTION public.bulk_import_discount_campaigns(
  p_data JSONB,
  p_imported_by UUID
)
RETURNS TABLE (
  row_number INTEGER,
  status TEXT,
  record_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      v_applies_to := LOWER(COALESCE(v_row->>'applies_to', 'all'));
      IF v_applies_to NOT IN ('all', 'new', 'rebooking') THEN
        v_applies_to := 'all';
      END IF;

      INSERT INTO public.discount_campaigns (
        name,
        description,
        discount_amount,
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
        (v_row->>'discount_amount')::NUMERIC(10,2),
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

GRANT EXECUTE ON FUNCTION public.bulk_import_discount_campaigns(JSONB, UUID) TO authenticated;
COMMENT ON FUNCTION public.bulk_import_discount_campaigns IS 'Bulk import discount campaigns';
