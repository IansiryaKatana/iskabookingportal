-- Ensure authenticated students can manage files inside the private `documents` bucket.
-- Policies target storage.objects because storage APIs respect row-level security.

begin;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Students upload documents'
  ) THEN
    EXECUTE $sql$
      create policy "Students upload documents"
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id = 'documents'
          and split_part(name, '/', 1) = auth.uid()::text
        );
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Students view documents'
  ) THEN
    EXECUTE $sql$
      create policy "Students view documents"
        on storage.objects
        for select
        to authenticated
        using (
          bucket_id = 'documents'
          and split_part(name, '/', 1) = auth.uid()::text
        );
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Staff manage documents'
  ) THEN
    EXECUTE $sql$
      create policy "Staff manage documents"
        on storage.objects
        for all
        to authenticated
        using (bucket_id = 'documents' and public.is_staff())
        with check (bucket_id = 'documents' and public.is_staff());
    $sql$;
  END IF;
END;
$$;

commit;

