-- Add academic year context to cashback campaigns
-- This allows campaigns to be associated with specific academic years

ALTER TABLE public.cashback_campaigns
ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;

-- Add index for academic year filtering
CREATE INDEX IF NOT EXISTS idx_cashback_campaigns_academic_year 
ON public.cashback_campaigns(academic_year_id) 
WHERE academic_year_id IS NOT NULL;

-- Update comment
COMMENT ON COLUMN public.cashback_campaigns.academic_year_id IS 
'Academic year this campaign applies to. NULL means the campaign applies to all academic years.';

