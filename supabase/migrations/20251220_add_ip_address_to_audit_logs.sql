-- Add IP Address to Audit Logs
-- This migration adds IP address tracking to staff activity logs for security and audit purposes

-- Add ip_address column to staff_activity_logs table
ALTER TABLE public.staff_activity_logs
ADD COLUMN IF NOT EXISTS ip_address INET;

-- Add index for IP address queries (useful for security investigations)
CREATE INDEX IF NOT EXISTS idx_staff_activity_logs_ip_address 
ON public.staff_activity_logs(ip_address) 
WHERE ip_address IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.staff_activity_logs.ip_address IS 
'IP address of the client that performed the action. Stored as INET type for efficient querying and validation.';

-- Update the log_staff_activity function to accept IP address
CREATE OR REPLACE FUNCTION public.log_staff_activity(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verify user is staff
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can log activities';
  END IF;

  -- Insert the log with IP address
  INSERT INTO public.staff_activity_logs (
    staff_id,
    action,
    entity_type,
    entity_id,
    payload,
    ip_address
  ) VALUES (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_payload,
    p_ip_address
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Re-grant execute permission
GRANT EXECUTE ON FUNCTION public.log_staff_activity(TEXT, TEXT, UUID, JSONB, INET) TO authenticated;

COMMENT ON FUNCTION public.log_staff_activity(TEXT, TEXT, UUID, JSONB, INET) IS 
'Logs a staff activity with optional IP address tracking. IP address is stored as INET type for efficient querying and validation.';

