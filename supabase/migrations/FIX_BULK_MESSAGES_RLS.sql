-- QUICK FIX: Recreate bulk_messages RLS policies
-- Run this in Supabase Dashboard > SQL Editor

-- Step 1: Drop and recreate bulk_messages policies
DROP POLICY IF EXISTS "Staff manage bulk messages" ON public.bulk_messages;

CREATE POLICY "Staff manage bulk messages" ON public.bulk_messages
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Step 2: Verify policy was created
SELECT 
  policyname,
  cmd,
  CASE WHEN with_check IS NOT NULL THEN with_check ELSE 'N/A' END AS with_check
FROM pg_policies
WHERE tablename = 'bulk_messages'
ORDER BY policyname, cmd;

-- Step 3: Test message
SELECT 'Bulk messages RLS policy fixed! Try sending a bulk message now.' AS status;

