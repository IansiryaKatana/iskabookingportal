-- Maintenance Requests System
-- Allows students to log maintenance requests and staff to manage them

-- ============================================================================
-- PART 1: MAINTENANCE REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.student_applications(id) ON DELETE SET NULL,
  studio_id UUID REFERENCES public.studios(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('maintenance', 'cleaning', 'general', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'cancelled')),
  images TEXT[], -- Array of storage paths
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_student_id ON public.maintenance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON public.maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_created_at ON public.maintenance_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_application_id ON public.maintenance_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_studio_id ON public.maintenance_requests(studio_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_academic_year_id ON public.maintenance_requests(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_priority ON public.maintenance_requests(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_request_type ON public.maintenance_requests(request_type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_maintenance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS maintenance_requests_updated_at ON public.maintenance_requests;
CREATE TRIGGER maintenance_requests_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_maintenance_requests_updated_at();

-- ============================================================================
-- PART 2: RLS POLICIES
-- ============================================================================

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Students can view and create their own requests
CREATE POLICY "Students manage own requests" ON public.maintenance_requests
  FOR ALL USING (auth.uid() = student_id);

-- Staff can view and manage all requests
CREATE POLICY "Staff manage all requests" ON public.maintenance_requests
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 3: GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.maintenance_requests TO authenticated;

-- ============================================================================
-- PART 4: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.maintenance_requests IS 'Maintenance and general requests from students';
COMMENT ON COLUMN public.maintenance_requests.request_type IS 'Type of request: maintenance, cleaning, general, other';
COMMENT ON COLUMN public.maintenance_requests.priority IS 'Priority level: low, normal, high, urgent';
COMMENT ON COLUMN public.maintenance_requests.status IS 'Request status: pending, in_progress, resolved, cancelled';
COMMENT ON COLUMN public.maintenance_requests.images IS 'Array of storage paths for uploaded images';

-- ============================================================================
-- PART 5: STORAGE BUCKET SETUP
-- ============================================================================

-- Storage bucket: maintenance-images
-- Path: maintenance-images/{user_id}/{uuid}.{ext}
-- 
-- IMPORTANT: Storage policies cannot be created via migrations.
-- Please follow the instructions in docs/STORAGE_BUCKET_SETUP_INSTRUCTIONS.md
-- 
-- Quick setup:
-- 1. Create bucket "maintenance-images" as PRIVATE in Supabase Dashboard > Storage
-- 2. Run the SQL policies from docs/STORAGE_BUCKET_SETUP_INSTRUCTIONS.md in SQL Editor

