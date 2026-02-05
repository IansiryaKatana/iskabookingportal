-- Ensure credentials used by Edge Functions are included when sync_to_edge_function was NULL
-- (e.g. rows created before the column existed or upserts that didn't set it)
UPDATE public.credentials
SET sync_to_edge_function = true
WHERE sync_to_edge_function IS NULL;
