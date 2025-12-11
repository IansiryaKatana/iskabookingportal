-- Remove the orphaned get_users_with_roles function that was accidentally added
-- This function references non-existent tables (user_roles) and functions (has_role)
-- and uses a different role system than our application

DROP FUNCTION IF EXISTS public.get_users_with_roles() CASCADE;


