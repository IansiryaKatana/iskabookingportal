import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STAFF_SUBROLES = new Set([
  "operations_manager",
  "reservationist",
  "accountant",
  "front_desk",
  "maintenance_officer",
  "housekeeper",
]);

export const ROUTE_PERMISSION_STALE_MS = 5 * 60 * 1000;
export const ROUTE_PERMISSION_GC_MS = 10 * 60 * 1000;

const routePermissionQueryOptions = {
  staleTime: ROUTE_PERMISSION_STALE_MS,
  gcTime: ROUTE_PERMISSION_GC_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
} as const;

function isStaffSubrole(role: string): boolean {
  return STAFF_SUBROLES.has(role);
}

function buildPermissionMap(
  routePaths: string[],
  role: string,
  rows: Array<{ route_path: string; role: string; allowed: boolean }> | null,
): Record<string, boolean> {
  const permissionMap: Record<string, boolean> = {};

  routePaths.forEach((path) => {
    const specificPerm = rows?.find((p) => p.route_path === path && p.role === role);
    if (specificPerm) {
      permissionMap[path] = specificPerm.allowed === true;
      return;
    }

    if (isStaffSubrole(role)) {
      permissionMap[path] = false;
      return;
    }

    const staffPerm = rows?.find((p) => p.route_path === path && p.role === "staff");
    if (staffPerm) {
      permissionMap[path] = staffPerm.allowed === true;
      return;
    }

    permissionMap[path] = true;
  });

  return permissionMap;
}

async function fetchRoutePermissionsBatch(
  routePaths: string[],
  role: string,
): Promise<Record<string, boolean>> {
  const rolesToCheck = [role];
  if (isStaffSubrole(role)) {
    rolesToCheck.push("staff");
  }

  const { data, error } = await supabase
    .from("route_permissions")
    .select("route_path, role, allowed")
    .in("route_path", routePaths)
    .in("role", rolesToCheck);

  if (error) {
    console.error("[useRoutePermissions] Error fetching route permissions:", error);
    if (isStaffSubrole(role)) {
      return routePaths.reduce((acc, path) => ({ ...acc, [path]: false }), {});
    }
    return routePaths.reduce((acc, path) => ({ ...acc, [path]: true }), {});
  }

  return buildPermissionMap(routePaths, role, data);
}

/**
 * Hook to check if the current user has permission to access a route
 * Returns true if user has access, false if denied, undefined if checking
 */
export const useRoutePermission = (routePath: string) => {
  const { role, loading } = useAuth();

  return useQuery({
    queryKey: ["route-permission", routePath, role],
    queryFn: async () => {
      if (!role || loading) return false;
      return fetchRoutePermissionsBatch([routePath], role).then(
        (map) => map[routePath] ?? false,
      );
    },
    enabled: !!role && !loading,
    ...routePermissionQueryOptions,
  });
};

/**
 * Hook to check multiple route permissions at once (for filtering navigation)
 * Returns a map of route paths to boolean (has access)
 */
export const useRoutePermissions = (routePaths: string[]) => {
  const { role, loading } = useAuth();
  const sortedPathsKey = routePaths.slice().sort().join(",");

  return useQuery({
    queryKey: ["route-permissions-batch", sortedPathsKey, role],
    queryFn: async () => {
      if (!role || loading) {
        return {};
      }
      return fetchRoutePermissionsBatch(routePaths, role);
    },
    enabled: !!role && !loading && routePaths.length > 0,
    placeholderData: (previousData) => previousData,
    ...routePermissionQueryOptions,
  });
};

type StaffRole =
  | "student"
  | "staff"
  | "superadmin"
  | "partner"
  | "admin"
  | "operations_manager"
  | "reservationist"
  | "accountant"
  | "front_desk"
  | "maintenance_officer"
  | "housekeeper";

/**
 * ProtectedRoute access check with route-level allowedRoles guard.
 */
export async function evaluateProtectedRouteAccess(
  permissionPath: string,
  role: StaffRole,
  allowedRoles: StaffRole[],
  checkDatabase: boolean,
): Promise<boolean> {
  if (!checkDatabase || !role) {
    return allowedRoles.includes(role);
  }

  const { data: specificRoleData, error: specificError } = await supabase
    .from("route_permissions")
    .select("allowed")
    .eq("route_path", permissionPath)
    .eq("role", role)
    .maybeSingle();

  if (specificError && specificError.code !== "PGRST116") {
    console.error("Error checking route permission:", specificError);
    return allowedRoles.includes(role);
  }

  if (specificRoleData !== null) {
    return specificRoleData.allowed === true;
  }

  if (isStaffSubrole(role)) {
    if (!allowedRoles.includes(role)) {
      return false;
    }

    const { data: staffData, error: staffError } = await supabase
      .from("route_permissions")
      .select("allowed")
      .eq("route_path", permissionPath)
      .eq("role", "staff")
      .maybeSingle();

    if (staffError && staffError.code !== "PGRST116") {
      console.error("Error checking staff route permission:", staffError);
      return allowedRoles.includes(role) || allowedRoles.includes("staff");
    }

    if (staffData !== null) {
      return staffData.allowed === true;
    }

    return true;
  }

  return allowedRoles.includes(role);
}
