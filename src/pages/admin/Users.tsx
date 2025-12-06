import { useState } from "react";
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

const Users = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "superadmin">("staff");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; first_name: string; last_name: string; email: string; role: string } | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRole, setEditRole] = useState<"staff" | "superadmin">("staff");

  // Fetch all users with profiles
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, role, first_name, last_name")
        .or("role.eq.staff,role.eq.superadmin")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user emails from auth via Edge Function
      const profileIds = (profiles || []).map((p) => p.id);
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
      return (profiles || []).map((profile) => ({
        ...profile,
        email: emailMap[profile.id] || "—",
      }));
    },
  });

  // Invite user mutation
  const inviteUser = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: "staff" | "superadmin" }) => {
      // Call Edge Function to invite user
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "invite",
          email,
          role,
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
        throw new Error(data?.message || "Failed to invite user");
      }

      // Log activity
      await logActivity({
        action: "create",
        entityType: "user",
        entityId: data?.user?.id,
        payload: { email, role },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Invitation sent",
        description: `Invitation email sent to ${inviteEmail}`,
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("staff");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  // Update role mutation
  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "staff" | "superadmin" }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", userId);

      if (error) throw error;

      // Log activity
      await logActivity({
        action: "update",
        entityType: "user",
        entityId: userId,
        payload: { role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async ({ userId, firstName, lastName, role }: { userId: string; firstName: string; lastName: string; role: "staff" | "superadmin" }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          first_name: firstName,
          last_name: lastName,
          role 
        })
        .eq("id", userId);

      if (error) throw error;

      // Log activity
      await logActivity({
        action: "update",
        entityType: "user",
        entityId: userId,
        payload: { first_name: firstName, last_name: lastName, role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "User updated",
        description: "User information has been updated successfully.",
      });
      setEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user",
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
    setSelectedUser(user);
    setEditFirstName(user.first_name || "");
    setEditLastName(user.last_name || "");
    setEditRole((user.role as "staff" | "superadmin") || "staff");
    setEditDialogOpen(true);
  };

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
              Invite staff members and manage user roles
            </p>
          </div>
          <Button
            onClick={() => setInviteDialogOpen(true)}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Plus className="h-4 w-4" />
            Invite User
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
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-muted-foreground">Role:</span>
                            <Badge variant="outline" className="uppercase text-xs">
                              {role}
                            </Badge>
                          </div>
                        </div>

                        {/* Role Selector */}
                        <div className="pt-2 space-y-2">
                          <Select
                            value={role}
                            onValueChange={(value) =>
                              updateRole.mutate({ userId: user.id, role: value as "staff" | "superadmin" })
                            }
                          >
                            <SelectTrigger className="w-full rounded-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="superadmin">Superadmin</SelectItem>
                            </SelectContent>
                          </Select>
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
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.first_name} {user.last_name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase">
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Select
                              value={user.role}
                              onValueChange={(value) =>
                                updateRole.mutate({ userId: user.id, role: value as "staff" | "superadmin" })
                              }
                            >
                              <SelectTrigger className="w-40 rounded-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="staff">Staff</SelectItem>
                                <SelectItem value="superadmin">Superadmin</SelectItem>
                              </SelectContent>
                            </Select>
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
                    ))}
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
                Invite your first staff member to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setInviteDialogOpen(true)}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Invite User
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Invite User
            </DialogTitle>
            <DialogDescription>
              Send an invitation email to a new staff member.
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
            <div>
              <Label htmlFor="role">Role *</Label>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "staff" | "superadmin")}>
                <SelectTrigger id="role" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)} className="rounded-full uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={() => inviteUser.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={!inviteEmail || inviteUser.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {inviteUser.isPending ? "Sending..." : "Send Invitation"}
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
              <Select value={editRole} onValueChange={(value) => setEditRole(value as "staff" | "superadmin")}>
                <SelectTrigger id="edit-role" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="rounded-full uppercase tracking-wide">
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
                  });
                }
              }}
              disabled={!editFirstName || !editLastName || updateUser.isPending}
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


