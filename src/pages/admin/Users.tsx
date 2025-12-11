import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, User, Shield, AtSign, MoreVertical, Pencil, Trash2, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { logActivity } from "@/utils/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import type { StaffSubrole } from "@/contexts/AuthContext";

// Helper function to format sub-role for display
const formatSubrole = (subrole: string | null): string => {
  if (!subrole) return "";
  return subrole
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const Users = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role: currentUserRole, profile: currentUserProfile } = useAuth();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "superadmin" | "admin">("staff");
  const [inviteStaffSubrole, setInviteStaffSubrole] = useState<StaffSubrole>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; first_name: string; last_name: string; email: string; role: string; staff_subrole?: string | null } | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRole, setEditRole] = useState<"staff" | "superadmin" | "admin">("staff");
  const [editStaffSubrole, setEditStaffSubrole] = useState<StaffSubrole>(null);

  // Determine which roles the current user can see based on visibility rules
  const getVisibleRoles = () => {
    if (currentUserRole === "superadmin") {
      // Superadmin can see everyone (including other superadmins)
      return ["staff", "superadmin", "admin"];
    } else if (currentUserRole === "admin") {
      // Admin can see all staff roles (including sub-roles) and admin, but NOT superadmin
      return ["staff", "admin"];
    } else if (currentUserRole === "staff") {
      // Staff sub-roles can only see other staff users
      return ["staff"];
    }
    return [];
  };

  // Fetch all users with profiles based on visibility rules
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", currentUserRole],
    queryFn: async () => {
      const visibleRoles = getVisibleRoles();
      
      if (visibleRoles.length === 0) {
        return [];
      }

      // Fetch profiles with staff_subrole included
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, role, first_name, last_name, staff_subrole")
        .in("role", visibleRoles)
        .order("created_at", { ascending: false });

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }

      // Filter out superadmins if current user is admin
      let filteredProfiles = profiles || [];
      if (currentUserRole === "admin") {
        filteredProfiles = filteredProfiles.filter((p) => p.role !== "superadmin");
      }

      console.log("Fetched profiles:", filteredProfiles?.length || 0, filteredProfiles);

      // Fetch user emails from auth via Edge Function
      const profileIds = filteredProfiles.map((p) => p.id);
      let emailMap: Record<string, string> = {};

      if (profileIds.length > 0) {
        try {
          const { data, error: emailError } = await supabase.functions.invoke("get-user-emails", {
            body: { userIds: profileIds },
          });

          if (!emailError && data?.emails) {
            emailMap = data.emails;
          } else if (emailError) {
            console.warn("Could not fetch user emails via edge function:", emailError);
          }
        } catch (err) {
          console.warn("Could not fetch user emails:", err);
        }
      }

      // Merge profiles with email data
      return filteredProfiles.map((profile) => ({
        ...profile,
        email: emailMap[profile.id] || "—",
      }));
    },
  });

  // Check if current user can create a specific role
  const canCreateRole = (role: "staff" | "superadmin" | "admin"): boolean => {
    if (currentUserRole === "superadmin") {
      return true; // Can create all roles
    } else if (currentUserRole === "admin") {
      return role !== "superadmin"; // Can create admin, staff, but not superadmin
    }
    return false; // Staff sub-roles cannot create users
  };

  // Create user mutation (changed from invite)
  const inviteUser = useMutation({
    mutationFn: async ({ 
      email, 
      firstName, 
      lastName, 
      role, 
      staffSubrole 
    }: { 
      email: string; 
      firstName: string; 
      lastName: string; 
      role: "staff" | "superadmin" | "admin";
      staffSubrole?: StaffSubrole;
    }) => {
      if (!canCreateRole(role)) {
        throw new Error("You do not have permission to create this role");
      }

      // Call Edge Function to create user
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create",
          email,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          role,
          staff_subrole: role === "staff" ? staffSubrole || null : null,
        },
      });

      if (error) {
        console.error("Edge function invoke error:", error);
        throw new Error(error.message || "Failed to invoke manage-users function");
      }

      if (data?.error) {
        console.error("Edge function returned error:", data.error);
        throw new Error(data.error);
      }

      if (!data || !data.success) {
        throw new Error(data?.message || "Failed to create user");
      }

      // Log activity
      await logActivity({
        action: "create",
        entityType: "user",
        entityId: data?.user?.id,
        payload: { email, first_name: firstName, last_name: lastName, role, staff_subrole: staffSubrole },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "User created",
        description: `User created successfully. They can use 'Forgot Password' to set their password.`,
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("staff");
      setInviteStaffSubrole(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  // Update role mutation
  const updateRole = useMutation({
    mutationFn: async ({ userId, role, staffSubrole }: { userId: string; role: "staff" | "superadmin" | "admin"; staffSubrole?: StaffSubrole }) => {
      if (!canCreateRole(role)) {
        throw new Error("You do not have permission to assign this role");
      }

      const updateData: { role: string; staff_subrole?: StaffSubrole } = { role };
      if (role === "staff" && staffSubrole !== undefined) {
        updateData.staff_subrole = staffSubrole;
      } else if (role !== "staff") {
        updateData.staff_subrole = null; // Clear sub-role if not staff
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", userId);

      if (error) throw error;

      // Log activity
      await logActivity({
        action: "update",
        entityType: "user",
        entityId: userId,
        payload: { role, staff_subrole: staffSubrole },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  // Update user mutation - use edge function to bypass RLS
  const updateUser = useMutation({
    mutationFn: async ({ 
      userId, 
      firstName, 
      lastName, 
      role, 
      staffSubrole 
    }: { 
      userId: string; 
      firstName: string; 
      lastName: string; 
      role: "staff" | "superadmin" | "admin";
      staffSubrole?: StaffSubrole;
    }) => {
      if (!canCreateRole(role)) {
        throw new Error("You do not have permission to assign this role");
      }

      console.log("Updating user via edge function:", { userId, firstName, lastName, role, staffSubrole });
      
      // Call Edge Function to update user (bypasses RLS)
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "update",
          userId,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          role,
          staff_subrole: role === "staff" ? staffSubrole || null : null,
        },
      });

      if (error) {
        console.error("Edge function invoke error:", error);
        throw new Error(error.message || "Failed to invoke manage-users function");
      }

      if (data?.error) {
        console.error("Edge function returned error:", data.error);
        throw new Error(data.error);
      }

      if (!data || !data.success) {
        throw new Error(data?.message || "Failed to update user");
      }

      console.log("User updated successfully:", data);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "User updated",
        description: "User information has been updated successfully.",
      });
      setEditDialogOpen(false);
      setSelectedUser(null);
      setEditFirstName("");
      setEditLastName("");
      setEditRole("staff");
      setEditStaffSubrole(null);
    },
    onError: (error: Error) => {
      console.error("Update user error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      // Call Edge Function to delete user
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "delete",
          userId,
        },
      });

      if (error) {
        console.error("Edge function invoke error:", error);
        throw new Error(error.message || "Failed to invoke manage-users function");
      }

      if (data?.error) {
        console.error("Edge function returned error:", data.error);
        throw new Error(data.error);
      }

      if (!data || !data.success) {
        throw new Error(data?.message || "Failed to delete user");
      }

      // Log activity
      await logActivity({
        action: "delete",
        entityType: "user",
        entityId: userId,
        payload: { 
          first_name: data?.deletedUser?.first_name,
          last_name: data?.deletedUser?.last_name,
          role: data?.deletedUser?.role 
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "User deleted",
        description: "User has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (user: typeof users[0]) => {
    console.log("Editing user:", user);
    setSelectedUser(user);
    setEditFirstName(user.first_name || "");
    setEditLastName(user.last_name || "");
    setEditRole((user.role as "staff" | "superadmin" | "admin") || "staff");
    setEditStaffSubrole((user.staff_subrole as StaffSubrole) || null);
    setEditDialogOpen(true);
  };

  // Debug: Log when edit dialog opens
  useEffect(() => {
    if (editDialogOpen && selectedUser) {
      console.log("Edit dialog opened with user:", selectedUser);
      console.log("Edit form values:", {
        firstName: editFirstName,
        lastName: editLastName,
        role: editRole,
      });
    }
  }, [editDialogOpen, selectedUser, editFirstName, editLastName, editRole]);

  const handleDelete = (user: typeof users[0]) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const UsersSkeleton = () => (
    <>
      {/* Mobile Card Skeletons */}
      <div className="lg:hidden space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="rounded-3xl">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-9 w-32" />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table Skeleton */}
      <Card className="hidden lg:block rounded-3xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-9 w-32 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );

  if (isLoading) {
    return (
      <AdminLayout pageTitle="User Management" subtitle="Manage staff and admin users">
        <div className="space-y-6">
          <UsersSkeleton />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      pageTitle="User Management" 
      subtitle="Manage staff and admin users"
      mobileActionButton={
        <Button
          size="sm"
          className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
          onClick={() => setInviteDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
              Users
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create staff members and manage user roles
            </p>
          </div>
          <Button
            onClick={() => setInviteDialogOpen(true)}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Plus className="h-4 w-4" />
            Create User
          </Button>
        </div>

        {users && users.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {users.map((user) => {
                const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
                const email = user.email || "—";
                const role = user.role || "staff";
                const subrole = user.staff_subrole;

                return (
                  <Card key={user.id} className="rounded-3xl border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      {/* Header with Name */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <h3 className="font-semibold text-base truncate">
                              {fullName}
                            </h3>
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 pt-2 border-t border-border/60">
                        <div className="flex items-center gap-2 text-sm">
                          <AtSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium truncate">{email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground">Role:</span>
                            <Badge variant="outline" className="uppercase text-xs">
                              {role}
                            </Badge>
                            {role === "staff" && subrole && (
                              <Badge variant="secondary" className="text-xs">
                                {formatSubrole(subrole)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Role Selector */}
                        <div className="pt-2 space-y-2">
                          <Select
                            value={role}
                            onValueChange={(value) => {
                              const newRole = value as "staff" | "superadmin" | "admin";
                              updateRole.mutate({ 
                                userId: user.id, 
                                role: newRole,
                                staffSubrole: newRole === "staff" ? (subrole as StaffSubrole) || null : null
                              });
                            }}
                          >
                            <SelectTrigger className="w-full rounded-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {canCreateRole("staff") && <SelectItem value="staff">Staff</SelectItem>}
                              {canCreateRole("admin") && <SelectItem value="admin">Admin</SelectItem>}
                              {canCreateRole("superadmin") && <SelectItem value="superadmin">Superadmin</SelectItem>}
                            </SelectContent>
                          </Select>
                          {role === "staff" && (
                            <Select
                              value={subrole || "none"}
                              onValueChange={(value) =>
                                updateRole.mutate({ 
                                  userId: user.id, 
                                  role: "staff",
                                  staffSubrole: value === "none" ? null : (value as StaffSubrole)
                                })
                              }
                            >
                              <SelectTrigger className="w-full rounded-full">
                                <SelectValue placeholder="Select sub-role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No sub-role</SelectItem>
                                <SelectItem value="operations_manager">Operations Manager</SelectItem>
                                <SelectItem value="reservationist">Reservationist</SelectItem>
                                <SelectItem value="accountant">Accountant</SelectItem>
                                <SelectItem value="front_desk">Front Desk</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 rounded-full uppercase tracking-wide text-xs"
                              onClick={() => handleEdit(user)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 rounded-full uppercase tracking-wide text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <Card className="hidden lg:block rounded-3xl">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Role</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const subrole = user.staff_subrole;
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.first_name} {user.last_name}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="uppercase">
                                {user.role}
                              </Badge>
                              {user.role === "staff" && subrole && (
                                <Badge variant="secondary" className="text-xs">
                                  {formatSubrole(subrole)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                value={user.role}
                                onValueChange={(value) => {
                                  const newRole = value as "staff" | "superadmin" | "admin";
                                  updateRole.mutate({ 
                                    userId: user.id, 
                                    role: newRole,
                                    staffSubrole: newRole === "staff" ? (subrole as StaffSubrole) || null : null
                                  });
                                }}
                              >
                                <SelectTrigger className="w-40 rounded-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {canCreateRole("staff") && <SelectItem value="staff">Staff</SelectItem>}
                                  {canCreateRole("admin") && <SelectItem value="admin">Admin</SelectItem>}
                                  {canCreateRole("superadmin") && <SelectItem value="superadmin">Superadmin</SelectItem>}
                                </SelectContent>
                              </Select>
                            {user.role === "staff" && (
                              <Select
                                value={subrole || "none"}
                                onValueChange={(value) =>
                                  updateRole.mutate({ 
                                    userId: user.id, 
                                    role: "staff",
                                    staffSubrole: value === "none" ? null : (value as StaffSubrole)
                                  })
                                }
                              >
                                <SelectTrigger className="w-40 rounded-full">
                                  <SelectValue placeholder="Sub-role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No sub-role</SelectItem>
                                  <SelectItem value="operations_manager">Operations Manager</SelectItem>
                                  <SelectItem value="reservationist">Reservationist</SelectItem>
                                  <SelectItem value="accountant">Accountant</SelectItem>
                                  <SelectItem value="front_desk">Front Desk</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                    <MoreVertical className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-2xl">
                                  <DropdownMenuItem onClick={() => handleEdit(user)} className="cursor-pointer">
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit User
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => handleDelete(user)} 
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete User
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Users Found
              </CardTitle>
              <CardDescription>
                Create your first staff member to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setInviteDialogOpen(true)}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Create User
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Create User
            </DialogTitle>
            <DialogDescription>
              Create a new staff member account. A password reset email will be sent to set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-2"
                placeholder="staff@urbanhub.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first-name">First Name *</Label>
                <Input
                  id="first-name"
                  type="text"
                  value={inviteFirstName}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  className="mt-2"
                  placeholder="John"
                />
              </div>
              <div>
                <Label htmlFor="last-name">Last Name *</Label>
                <Input
                  id="last-name"
                  type="text"
                  value={inviteLastName}
                  onChange={(e) => setInviteLastName(e.target.value)}
                  className="mt-2"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="role">Role *</Label>
              <Select value={inviteRole} onValueChange={(value) => {
                setInviteRole(value as "staff" | "superadmin" | "admin");
                if (value !== "staff") {
                  setInviteStaffSubrole(null);
                }
              }}>
                <SelectTrigger id="role" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canCreateRole("staff") && <SelectItem value="staff">Staff</SelectItem>}
                  {canCreateRole("admin") && <SelectItem value="admin">Admin</SelectItem>}
                  {canCreateRole("superadmin") && <SelectItem value="superadmin">Superadmin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {inviteRole === "staff" && (
              <div>
                <Label htmlFor="staff-subrole">Staff Sub-role (Optional)</Label>
                <Select value={inviteStaffSubrole || "none"} onValueChange={(value) => setInviteStaffSubrole(value === "none" ? null : (value as StaffSubrole))}>
                  <SelectTrigger id="staff-subrole" className="mt-2">
                    <SelectValue placeholder="Select sub-role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No sub-role</SelectItem>
                    <SelectItem value="operations_manager">Operations Manager</SelectItem>
                    <SelectItem value="reservationist">Reservationist</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="front_desk">Front Desk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setInviteDialogOpen(false);
              setInviteStaffSubrole(null);
            }} className="rounded-full uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={() => inviteUser.mutate({ 
                email: inviteEmail, 
                firstName: inviteFirstName,
                lastName: inviteLastName,
                role: inviteRole,
                staffSubrole: inviteRole === "staff" ? inviteStaffSubrole : undefined
              })}
              disabled={!inviteEmail || !inviteFirstName.trim() || !inviteLastName.trim() || inviteUser.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {inviteUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Edit User
            </DialogTitle>
            <DialogDescription>
              Update user information and role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-first-name">First Name</Label>
              <Input
                id="edit-first-name"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                className="mt-2"
                placeholder="John"
              />
            </div>
            <div>
              <Label htmlFor="edit-last-name">Last Name</Label>
              <Input
                id="edit-last-name"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                className="mt-2"
                placeholder="Doe"
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Role *</Label>
              <Select value={editRole} onValueChange={(value) => {
                setEditRole(value as "staff" | "superadmin" | "admin");
                if (value !== "staff") {
                  setEditStaffSubrole(null);
                }
              }}>
                <SelectTrigger id="edit-role" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canCreateRole("staff") && <SelectItem value="staff">Staff</SelectItem>}
                  {canCreateRole("admin") && <SelectItem value="admin">Admin</SelectItem>}
                  {canCreateRole("superadmin") && <SelectItem value="superadmin">Superadmin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {editRole === "staff" && (
              <div>
                <Label htmlFor="edit-staff-subrole">Staff Sub-role (Optional)</Label>
                <Select value={editStaffSubrole || "none"} onValueChange={(value) => setEditStaffSubrole(value === "none" ? null : (value as StaffSubrole))}>
                  <SelectTrigger id="edit-staff-subrole" className="mt-2">
                    <SelectValue placeholder="Select sub-role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No sub-role</SelectItem>
                    <SelectItem value="operations_manager">Operations Manager</SelectItem>
                    <SelectItem value="reservationist">Reservationist</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="front_desk">Front Desk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setEditStaffSubrole(null);
            }} className="rounded-full uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  updateUser.mutate({
                    userId: selectedUser.id,
                    firstName: editFirstName,
                    lastName: editLastName,
                    role: editRole,
                    staffSubrole: editRole === "staff" ? editStaffSubrole : undefined,
                  });
                }
              }}
              disabled={!editFirstName.trim() || !editLastName.trim() || updateUser.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {updateUser.isPending ? "Updating..." : "Update User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Delete User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : "this user"}? 
              This action cannot be undone and will permanently remove the user from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full uppercase tracking-wide">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUser) {
                  deleteUser.mutate(selectedUser.id);
                }
              }}
              disabled={deleteUser.isPending}
              className="rounded-full uppercase tracking-wide bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Users;


