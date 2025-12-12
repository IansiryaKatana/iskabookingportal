-- Fix staff access to documents storage for createSignedUrl
-- The issue is that createSignedUrl needs explicit SELECT permission
-- and the "for all" policy might not be sufficient

begin;

-- Drop and recreate the staff policy to ensure it works for createSignedUrl
DROP POLICY IF EXISTS "Staff manage documents" ON storage.objects;

-- Create separate policies for better control
-- SELECT policy for viewing/downloading documents (needed for createSignedUrl)
CREATE POLICY "Staff view documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' 
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

-- INSERT policy for uploading documents
CREATE POLICY "Staff upload documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' 
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

-- UPDATE policy for updating documents
CREATE POLICY "Staff update documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' 
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  )
  WITH CHECK (
    bucket_id = 'documents' 
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

-- DELETE policy for deleting documents
CREATE POLICY "Staff delete documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' 
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('staff', 'superadmin')
    )
  );

commit;

