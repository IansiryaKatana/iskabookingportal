import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to check if the current user has permission to access a route
 * Returns true if user has access, false if denied, undefined if checking
 */
export const useRoutePermission = (routePath: string) => {
  const { role, loading } = useAuth();

  return useQuery({
    queryKey: ["route-permission-check", routePath, role],
    queryFn: async () => {
      if (!role || loading) return false;

      // Check permission for the specific role first
      const { data: specificRoleData, error: specificError } = await supabase
        .from("route_permissions")
        .select("allowed")
        .eq("route_path", routePath)
        .eq("role", role)
        .maybeSingle();

      if (specificError && specificError.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is fine
        console.error("Error checking route permission:", specificError);
        return true; // Default to allowing if error (safe fallback)
      }

      // If specific role has a record, use it (even if false - deny access)
      // IMPORTANT: If sub-role is explicitly denied, deny access even if "staff" has access
      if (specificRoleData) {
        return specificRoleData.allowed === true;
      }

      // If no specific role record, check "staff" role for staff sub-roles
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk") {
        const { data: staffData, error: staffError } = await supabase
          .from("route_permissions")
          .select("allowed")
          .eq("route_path", routePath)
          .eq("role", "staff")
          .maybeSingle();

        if (staffError && staffError.code !== "PGRST116") {
          console.error("Error checking staff route permission:", staffError);
          return true; // Default to allowing if error
        }

        // If staff role has a record, use it
        if (staffData) {
          return staffData.allowed === true;
        }
      }

      // If no permission record exists in database, default to allowing (safe fallback)
      return true;
    },
    enabled: !!role && !loading,
    staleTime: 0, // No cache - always check fresh
    cacheTime: 30 * 1000, // Keep in cache for 30 seconds
    retry: 1,
  });
};

/**
 * Hook to check multiple route permissions at once (for filtering navigation)
 * Returns a map of route paths to boolean (has access)
 */
export const useRoutePermissions = (routePaths: string[]) => {
  const { role, loading } = useAuth();

  return useQuery({
    queryKey: ["route-permissions-batch", routePaths.sort().join(","), role],
    queryFn: async () => {
      if (!role || loading) {
        return {};
      }

      // Fetch all permissions for these routes and the user's role(s)
      const rolesToCheck = [role];
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk") {
        rolesToCheck.push("staff");
      }

      const { data, error } = await supabase
        .from("route_permissions")
        .select("route_path, role, allowed")
        .in("route_path", routePaths)
        .in("role", rolesToCheck);

      if (error) {
        console.error("Error fetching route permissions:", error);
        // Default to allowing all if error (safe fallback)
        return routePaths.reduce((acc, path) => ({ ...acc, [path]: true }), {});
      }

      // Build permission map
      const permissionMap: Record<string, boolean> = {};
      
      routePaths.forEach((path) => {
        // For sub-roles: Check staff permission first (if staff is denied, deny all sub-roles)
        if (rolesToCheck.includes("staff") && role !== "staff") {
          const staffPerm = data?.find((p) => p.route_path === path && p.role === "staff");
          if (staffPerm && !staffPerm.allowed) {
            // Staff is explicitly denied - deny all sub-roles
            permissionMap[path] = false;
            return;
          }
        }

        // Check specific role permission
        const specificPerm = data?.find((p) => p.route_path === path && p.role === role);
        if (specificPerm) {
          // If specific role has a record, use it (allows per-sub-role control)
          permissionMap[path] = specificPerm.allowed === true;
          return;
        }

        // Check staff role for sub-roles (only if no specific role record exists)
        if (rolesToCheck.includes("staff")) {
          const staffPerm = data?.find((p) => p.route_path === path && p.role === "staff");
          if (staffPerm) {
            permissionMap[path] = staffPerm.allowed === true;
            return;
          }
        }

        // If no permission record exists, default to allowing (safe fallback)
        // This allows routes that haven't been configured yet to still work
        permissionMap[path] = true;
      });
      return permissionMap;
    },
    enabled: !!role && !loading && routePaths.length > 0,
    staleTime: 30 * 1000, // Cache for 30 seconds to reduce flickering
    gcTime: 60 * 1000, // Keep in cache for 60 seconds
    refetchOnMount: false, // Don't refetch on mount if data is fresh (reduces flicker)
    refetchOnWindowFocus: false, // Don't refetch on window focus (reduces flicker)
    retry: 1,
  });
};

