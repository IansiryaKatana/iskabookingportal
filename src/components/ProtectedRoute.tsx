import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDefaultRouteForRole } from "@/utils/getDefaultRoute";
import {
  evaluateProtectedRouteAccess,
  ROUTE_PERMISSION_GC_MS,
  ROUTE_PERMISSION_STALE_MS,
} from "@/hooks/useRoutePermission";

/** UUID v4 pattern for last path segment (detail routes like /admin/applications/:id) */
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * For detail routes (e.g. /admin/applications/abc-123), return the parent path used in route_permissions
 * so the single "Applications" permission controls both list and detail.
 * For /portal/applications/:id/select-studio, return /portal/applications/select-studio so one permission controls all.
 */
function getPermissionPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // Portal application journey: /portal/applications/:id -> /portal/applications
  if (segments.length === 3 && segments[0] === "portal" && segments[1] === "applications" && UUID_SEGMENT.test(segments[2])) {
    return "/portal/applications";
  }
  // Portal studio selection: /portal/applications/:id/select-studio -> /portal/applications/select-studio
  if (segments.length >= 4 && segments[0] === "portal" && segments[1] === "applications" && UUID_SEGMENT.test(segments[2]) && segments[3] === "select-studio") {
    return "/portal/applications/select-studio";
  }
  // Admin (and other) detail routes: .../uuid at end -> parent path
  if (segments.length >= 2 && UUID_SEGMENT.test(segments[segments.length - 1])) {
    return "/" + segments.slice(0, -1).join("/");
  }
  return pathname;
}

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: Array<"student" | "staff" | "superadmin" | "partner" | "admin" | "operations_manager" | "reservationist" | "accountant" | "front_desk" | "maintenance_officer" | "housekeeper">;
  checkDatabase?: boolean; // Optional: if false, skips database check and uses allowedRoles only
};

const ProtectedRoute = ({ children, allowedRoles, checkDatabase = true }: ProtectedRouteProps) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const permissionPath = getPermissionPath(location.pathname);

  // Check database permissions (default: enabled)
  // For detail routes (e.g. /admin/applications/:id), use parent path so Permissions UI toggle controls both list and detail
  const { data: hasPermission, isLoading: checkingPermission } = useQuery({
    queryKey: ["route-permission", permissionPath, role, allowedRoles.join(",")],
    queryFn: () =>
      evaluateProtectedRouteAccess(permissionPath, role, allowedRoles, checkDatabase),
    enabled: !!role && !loading,
    staleTime: ROUTE_PERMISSION_STALE_MS,
    gcTime: ROUTE_PERMISSION_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Get default route for user - ALWAYS call this hook (use enabled to control when it runs)
  // This must be called before any conditional returns to maintain hook order
  const { data: defaultRoute, isLoading: loadingDefaultRoute } = useQuery({
    queryKey: ["default-route", role],
    queryFn: () => getDefaultRouteForRole(role || ""),
    enabled: !!role && !loading, // Always enabled when we have a role, but we'll check hasAccess before using it
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Show loading only if auth is loading, not if permission check is loading
  // This prevents flickering when navigating between pages
  // Keep page mounted during background token refresh if we already have a session.
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  
  // If permission check is loading, show children (optimistic rendering)
  // The permission check will redirect if access is denied
  if (checkDatabase && checkingPermission) {
    // Return children optimistically to prevent flicker
    // ProtectedRoute will redirect if access is denied once check completes
    return <>{children}</>;
  }

  if (!user) {
    // Redirect to appropriate login page based on route
    const isAdminRoute = location.pathname.startsWith("/admin");
    const isPortalRoute = location.pathname.startsWith("/portal");
    const isPartnerRoute = location.pathname.startsWith("/partner");
    const redirectTo = isAdminRoute
      ? "/admin/login"
      : isPartnerRoute
      ? "/partner/login"
      : isPortalRoute
      ? "/portal/login"
      : "/studios";
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // Check permissions: use database if enabled, otherwise use allowedRoles
  const hasAccess = checkDatabase 
    ? (hasPermission ?? allowedRoles.includes(role))
    : allowedRoles.includes(role);

  if (!hasAccess) {
    // Show loading while finding default route
    if (loadingDefaultRoute || !defaultRoute) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    // Redirect to user's default accessible route
    return <Navigate to={defaultRoute || "/admin"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

