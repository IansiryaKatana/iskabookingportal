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
        // For subroles, default to denying on error (safer default)
        if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
          return false;
        }
        return true; // Default to allowing if error for top-level roles (safe fallback)
      }

      // If specific role has a record, use it (even if false - deny access)
      // IMPORTANT: If sub-role is explicitly denied, deny access even if "staff" has access
      if (specificRoleData) {
        return specificRoleData.allowed === true;
      }

      // If no specific role record, check "staff" role for staff sub-roles
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
        const { data: staffData, error: staffError } = await supabase
          .from("route_permissions")
          .select("allowed")
          .eq("route_path", routePath)
          .eq("role", "staff")
          .maybeSingle();

        if (staffError && staffError.code !== "PGRST116") {
          console.error("Error checking staff route permission:", staffError);
          return false; // Default to denying for subroles on error
        }

        // If staff role has a record, use it
        if (staffData) {
          return staffData.allowed === true;
        }

        // For subroles: If no permission record exists, default to denying access
        return false;
      }

      // For top-level roles (staff, superadmin): If no permission record exists, default to allowing (safe fallback)
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
      if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
        rolesToCheck.push("staff");
      }

      const { data, error } = await supabase
        .from("route_permissions")
        .select("route_path, role, allowed")
        .in("route_path", routePaths)
        .in("role", rolesToCheck);

      if (error) {
        console.error("[useRoutePermissions] Error fetching route permissions:", error);
        // For subroles, default to denying all on error (safer default)
        // For top-level roles, default to allowing (safe fallback)
        if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
          return routePaths.reduce((acc, path) => ({ ...acc, [path]: false }), {});
        }
        return routePaths.reduce((acc, path) => ({ ...acc, [path]: true }), {});
      }


      // Build permission map
      const permissionMap: Record<string, boolean> = {};
      
      routePaths.forEach((path) => {
        // Check specific role permission
        const specificPerm = data?.find((p) => p.route_path === path && p.role === role);
        if (specificPerm) {
          // If specific role has a record, use it (allows per-sub-role control)
          // This respects explicit false values to deny access
          const hasAccess = specificPerm.allowed === true;
          permissionMap[path] = hasAccess;
          return;
        }

        // For sub-roles: Do NOT inherit from staff permissions - they must have explicit permission records
        // This ensures granular control per subrole - each subrole only sees routes explicitly granted to them
        if (role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk" || role === "maintenance_officer" || role === "housekeeper") {
          permissionMap[path] = false; // Subroles must have explicit permission - no inheritance from staff
          return;
        }

        // For top-level roles (staff, superadmin): Check staff permission or default to allowing
        if (rolesToCheck.includes("staff")) {
          const staffPerm = data?.find((p) => p.route_path === path && p.role === "staff");
          if (staffPerm) {
            permissionMap[path] = staffPerm.allowed === true;
            return;
          }
        }
        
        permissionMap[path] = true; // Top-level roles default to allowing
      });
      
      return permissionMap;
    },
    enabled: !!role && !loading && routePaths.length > 0,
    staleTime: 0, // No cache - always check fresh permissions to respect permission changes immediately
    gcTime: 5 * 1000, // Keep in cache for 5 seconds only
    refetchOnMount: true, // Refetch on mount to get latest permissions
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent unwanted redirects
    retry: 1,
  });
};

