import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AuditLogs = () => {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", search, actionFilter, staffFilter],
    queryFn: async () => {
      // Fetch logs first
      let query = supabase
        .from("staff_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      if (staffFilter !== "all") {
        query = query.eq("staff_id", staffFilter);
      }

      const { data: logs, error } = await query;

      if (error) throw error;

      // Fetch staff profiles separately and join
      const staffIds = [...new Set((logs || []).map((log) => log.staff_id).filter((id): id is string => Boolean(id)))];
      
      let staffProfiles: Record<string, any> = {};
      if (staffIds.length > 0 && staffIds.every(id => id !== undefined && id !== null)) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, role")
          .in("id", staffIds);

        if (!profilesError && profiles) {
          staffProfiles = profiles.reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Join staff profiles with logs
      return (logs || []).map((log) => ({
        ...log,
        staff: staffProfiles[log.staff_id] || null,
      }));
    },
  });

  // Fetch staff members for filter
  const { data: staffMembers } = useQuery({
    queryKey: ["staff-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("role", ["staff", "superadmin"])
        .order("first_name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const exportToCSV = () => {
    if (!logs || logs.length === 0) return;

    const headers = ["Date", "Staff Member", "Action", "Entity Type", "Entity ID", "Details"];
    const rows = logs.map((log) => [
      format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      log.staff ? `${log.staff.first_name} ${log.staff.last_name}` : "—",
      log.action,
      log.entity_type || "—",
      log.entity_id || "—",
      log.payload ? JSON.stringify(log.payload) : "—",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Audit Logs" subtitle="View staff activity and system changes">
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
    <AdminLayout pageTitle="Audit Logs" subtitle="View staff activity and system changes">
      <div className="space-y-6">
        {/* Filters */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="search">Search</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="action">Action Type</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger id="action" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="verify">Verify</SelectItem>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                    <SelectItem value="confirm">Confirm</SelectItem>
                    <SelectItem value="cancel">Cancel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="staff">Staff Member</Label>
                <Select value={staffFilter} onValueChange={setStaffFilter}>
                  <SelectTrigger id="staff" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffMembers?.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.first_name} {staff.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  Activity Logs
                </CardTitle>
                <CardDescription className="mt-1">
                  {logs ? `${logs.length} log${logs.length !== 1 ? "s" : ""} found` : "Loading..."}
                </CardDescription>
              </div>
              {logs && logs.length > 0 && (
                <Button
                  onClick={exportToCSV}
                  variant="outline"
                  className="rounded-full uppercase tracking-wide gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {logs && logs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Date & Time</TableHead>
                    <TableHead className="font-semibold">Staff Member</TableHead>
                    <TableHead className="font-semibold">Action</TableHead>
                    <TableHead className="font-semibold">Entity</TableHead>
                    <TableHead className="font-semibold">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {format(new Date(log.created_at), "d MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>
                        {log.staff ? `${log.staff.first_name} ${log.staff.last_name}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium capitalize">{log.entity_type || "—"}</p>
                          {log.entity_id && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {log.entity_id.substring(0, 8)}...
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground max-w-md truncate">
                          {log.details ? JSON.stringify(log.details) : "—"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No audit logs found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AuditLogs;


