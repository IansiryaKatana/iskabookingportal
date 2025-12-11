-- Fix RLS policies for route_permissions
-- All authenticated users need to READ route_permissions to check their own permissions
-- Only staff/admin/superadmin can WRITE/UPDATE route_permissions

BEGIN;

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view route permissions" ON public.route_permissions;
DROP POLICY IF EXISTS "Staff can manage route permissions" ON public.route_permissions;

-- New policy: All authenticated users can READ route_permissions (to check their own permissions)
CREATE POLICY "Authenticated users can view route permissions" ON public.route_permissions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- New policy: Only staff/admin/superadmin can manage (INSERT/UPDATE/DELETE) route_permissions
CREATE POLICY "Staff can manage route permissions" ON public.route_permissions
  FOR ALL
  USING (
    public.is_staff() OR 
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    public.is_staff() OR 
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMIT;

