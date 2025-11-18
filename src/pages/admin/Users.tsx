import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, User, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const Users = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "superadmin">("staff");

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
          const { data: emails, error: emailError } = await supabase.functions.invoke("get-user-emails", {
            body: { userIds: profileIds },
          });

          if (!emailError && emails) {
            emailMap = emails;
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
      // Create user in auth
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { role },
      });

      if (error) throw error;

      // Update profile role
      if (data.user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ role })
          .eq("id", data.user.id);

        if (profileError) {
          console.warn("Failed to update profile role:", profileError);
        }
      }

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

  if (isLoading) {
    return (
      <AdminLayout pageTitle="User Management" subtitle="Manage staff and admin users">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-3xl">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="User Management" subtitle="Manage staff and admin users">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
          <Card className="rounded-3xl">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
    </AdminLayout>
  );
};

export default Users;


