-- Studio Allocation Constraints and Index
-- Adds check constraint for allocation values and performance index
-- Allocation can be: NULL (Unallocated), 'Student', 'OTA', 'Keyworkers', or UUID (temporary student reservation)

-- Add check constraint for allocation values
ALTER TABLE public.studios
ADD CONSTRAINT studios_allocation_check 
CHECK (
  allocation IS NULL 
  OR allocation = 'Student' 
  OR allocation = 'OTA' 
  OR allocation = 'Keyworkers'
  OR allocation ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- UUID format for temporary reservations
);

-- Add index for allocation filtering performance
CREATE INDEX IF NOT EXISTS idx_studios_allocation 
ON public.studios(allocation) 
WHERE allocation IS NOT NULL;

-- Update column comment
COMMENT ON COLUMN public.studios.allocation IS 
'Studio allocation category: NULL (Unallocated), "Student", "OTA", "Keyworkers", or UUID (temporary student reservation during 30-min hold period)';

