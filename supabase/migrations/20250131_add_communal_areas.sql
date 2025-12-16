-- Communal Areas Housekeeping System
-- Allows tracking and managing cleaning for communal areas (lobbies, gyms, common rooms, etc.)
-- Same approval workflow as studio housekeeping

BEGIN;

-- ============================================================================
-- PART 1: COMMUNAL AREAS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.communal_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT, -- "Ground Floor", "Building A", etc.
  description TEXT,
  cleaning_schedule_type TEXT NOT NULL CHECK (cleaning_schedule_type IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')) DEFAULT 'weekly',
  cleaning_schedule_days INTEGER[], -- For weekly: [1,3,5] = Mon, Wed, Fri (1=Monday, 7=Sunday)
  cleaning_schedule_time TIME, -- Default cleaning time (optional)
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for communal_areas
CREATE INDEX IF NOT EXISTS idx_communal_areas_active ON public.communal_areas(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_communal_areas_created_by ON public.communal_areas(created_by);

-- Updated_at trigger
CREATE TRIGGER communal_areas_updated_at
  BEFORE UPDATE ON public.communal_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 2: COMMUNAL AREA HOUSEKEEPING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.communal_area_housekeeping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communal_area_id UUID NOT NULL REFERENCES public.communal_areas(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('dirty', 'clean_pending_approval', 'clean', 'out_of_order')) DEFAULT 'clean',
  assigned_cleaner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_cleaned_at TIMESTAMPTZ,
  next_clean_due_at DATE, -- Calculated from schedule
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(communal_area_id) -- One record per area
);

-- Indexes for communal_area_housekeeping
CREATE INDEX IF NOT EXISTS idx_communal_area_housekeeping_area_id ON public.communal_area_housekeeping(communal_area_id);
CREATE INDEX IF NOT EXISTS idx_communal_area_housekeeping_status ON public.communal_area_housekeeping(status);
CREATE INDEX IF NOT EXISTS idx_communal_area_housekeeping_cleaner ON public.communal_area_housekeeping(assigned_cleaner_id);
CREATE INDEX IF NOT EXISTS idx_communal_area_housekeeping_approval ON public.communal_area_housekeeping(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_communal_area_housekeeping_next_clean ON public.communal_area_housekeeping(next_clean_due_at) WHERE next_clean_due_at IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER communal_area_housekeeping_updated_at
  BEFORE UPDATE ON public.communal_area_housekeeping
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================================
-- PART 3: AUTO-DIRTY TRIGGER FOR OVERDUE AREAS
-- ============================================================================

-- Function to auto-mark overdue areas as dirty
CREATE OR REPLACE FUNCTION public.auto_mark_overdue_communal_areas_dirty()
RETURNS TRIGGER AS $$
BEGIN
  -- When next_clean_due_at is in the past and status is 'clean', mark as 'dirty'
  IF NEW.next_clean_due_at IS NOT NULL 
     AND NEW.next_clean_due_at < CURRENT_DATE 
     AND NEW.status = 'clean' 
     AND (OLD.status = 'clean' OR OLD.status IS NULL) THEN
    NEW.status = 'dirty';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_overdue_communal_areas
  BEFORE UPDATE ON public.communal_area_housekeeping
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_mark_overdue_communal_areas_dirty();

-- ============================================================================
-- PART 4: RLS POLICIES
-- ============================================================================

ALTER TABLE public.communal_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communal_area_housekeeping ENABLE ROW LEVEL SECURITY;

-- Communal areas: Staff can manage, cleaners can read
CREATE POLICY "Staff manage communal areas" ON public.communal_areas
  FOR ALL USING (public.is_staff());

-- Communal area housekeeping: Staff can manage, cleaners can update assigned areas
CREATE POLICY "Staff manage communal area housekeeping" ON public.communal_area_housekeeping
  FOR ALL USING (public.is_staff());

-- ============================================================================
-- PART 5: GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communal_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communal_area_housekeeping TO authenticated;

-- ============================================================================
-- PART 6: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.communal_areas IS 'Communal areas that require housekeeping (lobbies, gyms, common rooms, etc.)';
COMMENT ON TABLE public.communal_area_housekeeping IS 'Housekeeping status tracking for communal areas, same workflow as studio housekeeping';
COMMENT ON COLUMN public.communal_areas.cleaning_schedule_days IS 'Array of day numbers (1=Monday, 7=Sunday) for weekly schedules';
COMMENT ON COLUMN public.communal_area_housekeeping.next_clean_due_at IS 'Next scheduled cleaning date, calculated from area schedule. Auto-marks as dirty when overdue.';

COMMIT;

