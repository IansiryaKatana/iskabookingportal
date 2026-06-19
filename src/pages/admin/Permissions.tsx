import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Save, RefreshCw, Shield, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/auditLog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";

type RoutePermission = {
  id: string;
  route_path: string;
  route_name: string;
  role: string;
  allowed: boolean;
};

type PermissionMap = Record<string, Record<string, { id: string; allowed: boolean }>>;

// Helper to format role names for display
const formatRoleName = (role: string): string => {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  if (role === "staff") return "Staff";
  if (role === "student") return "Student";
  if (role === "partner") return "Partner";
  // Staff sub-roles
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const Permissions = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile: currentUserProfile } = useAuth();
  const accountRole = currentUserProfile?.role;
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch all route permissions
  const { data: routePermissions, isLoading } = useQuery({
    queryKey: ["route-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_permissions")
        .select("*")
        .order("route_path", { ascending: true });

      if (error) throw error;

      // Group by route_path, then by role
      const grouped: PermissionMap = {};
      (data || []).forEach((perm: RoutePermission) => {
        if (!grouped[perm.route_path]) {
          grouped[perm.route_path] = {};
        }
        grouped[perm.route_path][perm.role] = {
          id: perm.id,
          allowed: perm.allowed,
        };
      });

      setPermissions(grouped);
      setHasChanges(false);
      return data as RoutePermission[];
    },
  });

  // Get unique routes and roles
  const routes = useMemo(() => {
    if (!routePermissions) return [];
    const routeMap = new Map<string, string>();
    routePermissions.forEach((perm) => {
      if (!routeMap.has(perm.route_path)) {
        routeMap.set(perm.route_path, perm.route_name);
      }
    });
    return Array.from(routeMap.entries())
      .map(([path, name]) => ({ path, name }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [routePermissions]);

  const roles = useMemo(() => {
    if (!routePermissions) return [];
    const roleSet = new Set<string>();
    routePermissions.forEach((perm) => {
      roleSet.add(perm.role);
    });
    const allRoles = Array.from(roleSet);
    const filteredRoles =
      accountRole === "admin"
        ? allRoles.filter((role) => role !== "superadmin" && role !== "admin")
        : allRoles;
    return filteredRoles.sort((a, b) => {
      // Sort: superadmin, admin, staff, then sub-roles, then student, partner
      const order: Record<string, number> = {
        superadmin: 0,
        admin: 1,
        staff: 2,
        operations_manager: 3,
        reservationist: 4,
        accountant: 5,
        front_desk: 6,
        maintenance_officer: 7,
        housekeeper: 8,
        student: 9,
        partner: 10,
      };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });
  }, [routePermissions, accountRole]);

  // Update permission locally
  const togglePermission = (routePath: string, role: string, allowed: boolean) => {
    setPermissions((prev) => {
      const updated = { ...prev };
      if (!updated[routePath]) {
        updated[routePath] = {};
      }
      // Get the existing permission ID from original data if not already in state
      const existingPerm = routePermissions?.find(
        (p) => p.route_path === routePath && p.role === role
      );
      const currentPerm = updated[routePath][role];
      updated[routePath][role] = {
        id: currentPerm?.id || existingPerm?.id || "",
        allowed,
      };
      return updated;
    });
    setHasChanges(true);
  };

  // Save all permissions
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: Array<{ id: string; allowed: boolean }> = [];
      const inserts: Array<{ route_path: string; route_name: string; role: string; allowed: boolean }> = [];

      // Collect all changes (both updates and inserts)
      Object.entries(permissions).forEach(([routePath, rolePerms]) => {
        // Get route name for inserts
        const routeName = routes.find((r) => r.path === routePath)?.name || routePath;
        
        Object.entries(rolePerms).forEach(([role, perm]) => {
          const original = routePermissions?.find(
            (p) => p.route_path === routePath && p.role === role
          );
          
          if (original) {
            // Existing record - update if changed
            if (original.allowed !== perm.allowed) {
              updates.push({ id: perm.id, allowed: perm.allowed });
            }
          } else {
            // New record - insert if allowed is true (only save ON permissions, OFF permissions don't need records)
            if (perm.allowed) {
              inserts.push({
                route_path: routePath,
                route_name: routeName,
                role: role,
                allowed: perm.allowed,
              });
            }
          }
        });
      });

      if (updates.length === 0 && inserts.length === 0) {
        return;
      }

      // Update existing records
      for (const update of updates) {
        const { error } = await supabase
          .from("route_permissions")
          .update({ allowed: update.allowed })
          .eq("id", update.id);

        if (error) throw error;
      }

      // Insert new records (use upsert to handle any race conditions)
      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from("route_permissions")
          .upsert(inserts, {
            onConflict: "route_path,role",
            ignoreDuplicates: false,
          });

        if (insertError) throw insertError;
      }

      // Log activity
      await logActivity({
        action: "update",
        entityType: "route_permissions",
        entityId: null,
        payload: {
          updated_count: updates.length,
          inserted_count: inserts.length,
          changes: [
            ...updates.map((u) => ({ id: u.id, allowed: u.allowed, type: "update" })),
            ...inserts.map((i) => ({ route_path: i.route_path, role: i.role, allowed: i.allowed, type: "insert" })),
          ],
        },
      });
    },
    onSuccess: async () => {
      // Invalidate all route permission queries to force refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["route-permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["route-permission"] }),
        queryClient.invalidateQueries({ queryKey: ["route-permissions-batch"] }),
      ]);
      
      await queryClient.refetchQueries({ queryKey: ["route-permissions-batch"] });
      
      toast({
        title: "Permissions updated",
        description: "Route permissions have been saved successfully. Navigation will update shortly.",
      });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save permissions",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Route Permissions" subtitle="Manage which roles can access which pages">
        <div className="space-y-6">
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Route Permissions" subtitle="Manage which roles can access which pages">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="hidden lg:block">
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
              Route Permissions
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Control which roles have access to which pages. Changes take effect immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["route-permissions"] })}
              className="rounded-md uppercase tracking-wide gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className="rounded-md uppercase tracking-wide gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-4">
          {routes.map((route) => (
            <Card key={route.path} className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-lg font-display uppercase tracking-wide">
                  {route.name}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{route.path}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {roles.map((role) => {
                  const perm = permissions[route.path]?.[role];
                  const allowed = perm?.allowed ?? false;
                  return (
                    <div key={role} className="flex items-center justify-between p-3 border rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor={`${route.path}-${role}`} className="font-medium">
                          {formatRoleName(role)}
                        </Label>
                      </div>
                      <Switch
                        id={`${route.path}-${role}`}
                        checked={allowed}
                        onCheckedChange={(checked) => togglePermission(route.path, role, checked)}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop Table View */}
        <Card className="hidden lg:block rounded-3xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold sticky left-0 bg-background z-10 min-w-[200px]">
                      Route
                    </TableHead>
                    {roles.map((role) => (
                      <TableHead key={role} className="font-semibold text-center min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <Shield className="h-4 w-4" />
                          <span className="text-xs">{formatRoleName(role)}</span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((route) => (
                    <TableRow key={route.path}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        <div>
                          <div className="font-semibold">{route.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{route.path}</div>
                        </div>
                      </TableCell>
                      {roles.map((role) => {
                        const perm = permissions[route.path]?.[role];
                        const allowed = perm?.allowed ?? false;
                        return (
                          <TableCell key={role} className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={allowed}
                                onCheckedChange={(checked) => togglePermission(route.path, role, checked)}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {routes.length === 0 && (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Routes Found
              </CardTitle>
              <CardDescription>
                Route permissions will appear here once they are configured.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default Permissions;

