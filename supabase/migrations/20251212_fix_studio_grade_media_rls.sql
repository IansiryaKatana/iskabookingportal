-- Fix Studio Grade Media RLS Policies
-- Ensure staff can read, insert, update, and delete studio_grade_media
-- Ensure public can read studio_grade_media (for public pages)

BEGIN;

-- Ensure public read policy exists (for public studio grade pages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_grade_media'
      AND policyname = 'Public read studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Public read studio media"
        ON public.studio_grade_media
        FOR SELECT
        TO anon, authenticated
        USING (true);
    $sql$;
  END IF;
END;
$$;

-- Ensure staff can select studio media (for admin pages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_grade_media'
      AND policyname = 'Staff manage studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff manage studio media"
        ON public.studio_grade_media
        FOR SELECT
        TO authenticated
        USING (public.is_staff());
    $sql$;
  END IF;
END;
$$;

-- Ensure staff can insert studio media
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_grade_media'
      AND policyname = 'Staff insert studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff insert studio media"
        ON public.studio_grade_media
        FOR INSERT
        TO authenticated
        WITH CHECK (public.is_staff());
    $sql$;
  END IF;
END;
$$;

-- Ensure staff can update studio media
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_grade_media'
      AND policyname = 'Staff update studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff update studio media"
        ON public.studio_grade_media
        FOR UPDATE
        TO authenticated
        USING (public.is_staff())
        WITH CHECK (public.is_staff());
    $sql$;
  END IF;
END;
$$;

-- Ensure staff can delete studio media
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_grade_media'
      AND policyname = 'Staff delete studio media'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Staff delete studio media"
        ON public.studio_grade_media
        FOR DELETE
        TO authenticated
        USING (public.is_staff());
    $sql$;
  END IF;
END;
$$;

COMMIT;

