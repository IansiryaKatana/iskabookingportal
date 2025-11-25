-- Optional: Add GIN index on bulk_messages.filters for better JSON query performance
-- This is optional and not required for functionality, but helps with performance
-- when querying targeted vs bulk messages

-- Create GIN index on filters JSONB column for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_bulk_messages_filters_gin 
ON public.bulk_messages USING GIN (filters);

-- This index helps with queries like:
-- WHERE filters->>'message_type' = 'targeted'
-- WHERE filters ? 'student_ids'
-- etc.

