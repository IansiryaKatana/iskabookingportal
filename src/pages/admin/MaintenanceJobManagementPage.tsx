import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useMaintenanceRequests, useUpdateMaintenanceRequest, type MaintenanceRequestWithRelations } from "@/hooks/useMaintenanceRequests";
import { useStaffMembers } from "@/hooks/useStaffMembers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO, isPast, isBefore } from "date-fns";
import {
  Wrench,
  Filter,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Building2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getPriorityInfoFromUrgency } from "@/utils/maintenancePriority";

// Status Badge Helper
const getStatusBadge = (status: string) => {
  const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
    new: { className: "bg-blue-500 hover:bg-blue-600 text-white", icon: Clock, label: "New" },
    triaged: { className: "bg-purple-500 hover:bg-purple-600 text-white", icon: AlertCircle, label: "Triaged" },
    assigned: { className: "bg-yellow-500 hover:bg-yellow-600 text-white", icon: UserCheck, label: "Assigned" },
    in_progress: { className: "bg-orange-500 hover:bg-orange-600 text-white", icon: Loader2, label: "In Progress" },
    completed_pending_approval: { className: "bg-indigo-500 hover:bg-indigo-600 text-white", icon: Clock, label: "Pending Approval" },
    resolved: { className: "bg-green-500 hover:bg-green-600 text-white", icon: CheckCircle2, label: "Resolved" },
    rework_required: { className: "bg-red-500 hover:bg-red-600 text-white", icon: XCircle, label: "Rework Required" },
    cancelled: { className: "bg-gray-500 hover:bg-gray-600 text-white", icon: XCircle, label: "Cancelled" },
  };

  const config = configs[status] || configs.new;
  const Icon = config.icon;

  return (
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

// Urgency / Priority Badge Helper
const getUrgencyBadge = (urgency: string | null) => {
  if (!urgency) return null;

  const info = getPriorityInfoFromUrgency(
    (urgency || "medium") as "low" | "medium" | "high" | "emergency"
  );

  const colorByBand: Record<string, { className: string }> = {
    P1: { className: "bg-red-500 hover:bg-red-600 text-white" },
    P2: { className: "bg-orange-500 hover:bg-orange-600 text-white" },
    P3: { className: "bg-blue-500 hover:bg-blue-600 text-white" },
  };

  const compactLabelByBand: Record<string, string> = {
    P1: "P1 • 24 hrs",
    P2: "P2 • 5 days",
    P3: "P3 • 28 days",
  };

  const config = colorByBand[info.band] || colorByBand.P3;
  const label = compactLabelByBand[info.band] || compactLabelByBand.P3;

  return (
    <Badge className={`${config.className} rounded-full px-2 py-0.5 text-xs font-medium flex items-center`}>
      {label}
    </Badge>
  );
};

const MaintenanceJobManagementPage = () => {
  const { toast } = useToast();
  const { role, profile, user } = useAuth();
  const isMobile = useIsMobile();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all"); // "all", "assigned", "unassigned", specific user id
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Details drawer/sheet
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequestWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Assignment dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);

  // Determine filtering based on role
  // Maintenance officers see: their assigned requests + unassigned (to claim)
  // Operations managers and superadmins see: everything
  const isMaintenanceOfficer = profile?.staff_subrole === "maintenance_officer";
  const shouldFilterByUser = isMaintenanceOfficer && user?.id;
  
  const { data: requests, isLoading } = useMaintenanceRequests(
    shouldFilterByUser
      ? {
          assignedToUserId: user.id,
          includeUnassigned: true, // Allow maintenance officers to see unassigned requests they can claim
        }
      : undefined // Ops managers see all
  );
  const { data: maintenanceOfficers } = useStaffMembers({ role: "staff", staff_subrole: "maintenance_officer" });
  const updateRequest = useUpdateMaintenanceRequest();

  // Filtered requests
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    let filtered = requests;

    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (urgencyFilter !== "all") {
      filtered = filtered.filter((r) => r.urgency === urgencyFilter);
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((r) => r.category === categoryFilter);
    }

    if (assignedFilter === "assigned") {
      filtered = filtered.filter((r) => r.assigned_to_user_id !== null);
    } else if (assignedFilter === "unassigned") {
      filtered = filtered.filter((r) => r.assigned_to_user_id === null);
    } else if (assignedFilter !== "all") {
      filtered = filtered.filter((r) => r.assigned_to_user_id === assignedFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.studio?.studio_number.toLowerCase().includes(query) ||
          r.id.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [requests, statusFilter, urgencyFilter, categoryFilter, assignedFilter, searchQuery]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!requests) {
      return {
        total: 0,
        new: 0,
        unassigned: 0,
        assigned: 0,
        in_progress: 0,
        pending_approval: 0,
        overdue: 0,
      };
    }

    const now = new Date();
    return {
      total: requests.length,
      new: requests.filter((r) => r.status === "new").length,
      unassigned: requests.filter((r) => !r.assigned_to_user_id && (r.status === "new" || r.status === "triaged")).length,
      assigned: requests.filter((r) => r.assigned_to_user_id && r.status === "assigned").length,
      in_progress: requests.filter((r) => r.status === "in_progress").length,
      pending_approval: requests.filter((r) => r.status === "completed_pending_approval").length,
      overdue: requests.filter((r) => {
        if (!r.sla_due_at) return false;
        return isBefore(parseISO(r.sla_due_at), now) && 
               (r.status === "new" || r.status === "triaged" || r.status === "assigned" || r.status === "in_progress");
      }).length,
    };
  }, [requests]);

  // Check if user is Ops Manager (already determined above for filtering)
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";
  // isMaintenanceOfficer is already declared above for filtering

  // Handle row click
  const handleRowClick = (request: MaintenanceRequestWithRelations) => {
    setSelectedRequest(request);
    setDetailsOpen(true);
  };

  // Handle assign/reassign
  const handleAssign = async () => {
    if (!selectedRequest) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a request.",
      });
      return;
    }

    try {
      await updateRequest.mutateAsync({
        id: selectedRequest.id,
        updates: {
          assigned_to_user_id: selectedOfficerId || null,
          status: selectedRequest.status === "new" || selectedRequest.status === "triaged" ? "assigned" : selectedRequest.status,
        },
      });

      toast({
        title: "Officer assigned",
        description: "The maintenance officer has been assigned successfully.",
      });

      setAssignDialogOpen(false);
      setSelectedOfficerId(null);
      setDetailsOpen(false);
      setSelectedRequest(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign officer.",
      });
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedRequest) return;

    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === "completed_pending_approval" && isMaintenanceOfficer) {
        // Maintenance officer marking as complete
        updates.completion_note = selectedRequest.completion_note || "Completed by maintenance officer";
        updates.approval_status = "pending";
      }

      await updateRequest.mutateAsync({
        id: selectedRequest.id,
        updates,
      });

      toast({
        title: "Status updated",
        description: "The maintenance request status has been updated successfully.",
      });

      setDetailsOpen(false);
      setSelectedRequest(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout 
        pageTitle="Job Management" 
        subtitle={isMaintenanceOfficer ? "View and manage your assigned maintenance jobs" : "Manage maintenance job assignments and scheduling"}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Card key={i} className="rounded-3xl">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="rounded-3xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Job Management" subtitle="Manage maintenance job assignments and scheduling">
      <div className="space-y-6">
        {/* Stats Cards - Click to Filter */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "new" ? "all" : "new")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">New</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.new}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setAssignedFilter(assignedFilter === "unassigned" ? "all" : "unassigned")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Unassigned</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{stats.unassigned}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setAssignedFilter(assignedFilter === "assigned" ? "all" : "assigned")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Assigned</div>
              <div className="text-xl md:text-2xl font-bold text-green-600">{stats.assigned}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">In Progress</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.in_progress}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "completed_pending_approval" ? "all" : "completed_pending_approval")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Pending Approval</div>
              <div className="text-xl md:text-2xl font-bold text-indigo-600">{stats.pending_approval}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Overdue</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.overdue}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total</div>
              <div className="text-xl md:text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="triaged">Triaged</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed_pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="rework_required">Rework Required</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Urgency</Label>
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Urgency</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="internet_wifi">Internet/WiFi</SelectItem>
                    <SelectItem value="furniture">Furniture</SelectItem>
                    <SelectItem value="appliance">Appliance</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="bathroom">Bathroom</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Assigned To</Label>
                <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {maintenanceOfficers?.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.first_name} {officer.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search</Label>
                <Input
                  placeholder="Title, description, studio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Maintenance Requests
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No requests found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== "all" || urgencyFilter !== "all" || categoryFilter !== "all" || assignedFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No maintenance requests found."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">Title</TableHead>
                        <TableHead className="text-xs md:text-sm">Studio</TableHead>
                        <TableHead className="text-xs md:text-sm">Category</TableHead>
                        <TableHead className="text-xs md:text-sm">Urgency</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Assigned To</TableHead>
                        <TableHead className="text-xs md:text-sm">SLA Due</TableHead>
                        <TableHead className="text-xs md:text-sm">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => {
                        const isOverdue = request.sla_due_at && 
                          isBefore(parseISO(request.sla_due_at), new Date()) && 
                          (request.status === "new" || request.status === "triaged" || request.status === "assigned" || request.status === "in_progress");
                        
                        return (
                          <TableRow
                            key={request.id}
                            className="hover:bg-accent/50 cursor-pointer"
                            onClick={() => handleRowClick(request)}
                          >
                            <TableCell>
                              <div className="font-semibold text-sm">{request.title}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-xs">
                                {request.description}
                              </div>
                            </TableCell>
                            <TableCell>
                              {request.studio ? (
                                <span className="text-sm font-medium">
                                  {request.studio.studio_number}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {request.category ? (
                                <Badge variant="outline" className="text-xs">
                                  {request.category.replace("_", " ")}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>{getUrgencyBadge(request.urgency)}</TableCell>
                            <TableCell>{getStatusBadge(request.status || "new")}</TableCell>
                            <TableCell>
                              {request.assigned_to ? (
                                <span className="text-xs">
                                  {request.assigned_to.first_name} {request.assigned_to.last_name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {request.sla_due_at ? (
                                <div className="text-xs">
                                  <div>{format(parseISO(request.sla_due_at), "MMM d, yyyy")}</div>
                                  {isOverdue && (
                                    <Badge variant="destructive" className="mt-1 text-xs">
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(parseISO(request.created_at), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {filteredRequests.map((request) => {
                    const isOverdue = request.sla_due_at && 
                      isBefore(parseISO(request.sla_due_at), new Date()) && 
                      (request.status === "new" || request.status === "triaged" || request.status === "assigned" || request.status === "in_progress");
                    
                    return (
                      <Card
                        key={request.id}
                        className="rounded-2xl border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleRowClick(request)}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="text-sm font-semibold mb-1">{request.title}</h3>
                                {request.studio && (
                                  <p className="text-xs text-muted-foreground">
                                    Studio {request.studio.studio_number}
                                  </p>
                                )}
                              </div>
                              {getStatusBadge(request.status || "new")}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {request.category && (
                                <Badge variant="outline" className="text-xs">
                                  {request.category.replace("_", " ")}
                                </Badge>
                              )}
                              {getUrgencyBadge(request.urgency)}
                            </div>
                            {request.assigned_to && (
                              <div className="text-xs text-muted-foreground">
                                Assigned to: {request.assigned_to.first_name} {request.assigned_to.last_name}
                              </div>
                            )}
                            {request.sla_due_at && (
                              <div className="text-xs text-muted-foreground">
                                SLA Due: {format(parseISO(request.sla_due_at), "MMM d, yyyy")}
                                {isOverdue && (
                                  <Badge variant="destructive" className="ml-2 text-xs">
                                    Overdue
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Details Drawer/Sheet */}
        {selectedRequest && (
          <>
            {isMobile ? (
              <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DrawerContent className="max-h-[96vh]">
                  <DrawerHeader className="text-left">
                    <DrawerTitle>{selectedRequest.title}</DrawerTitle>
                    <DrawerDescription>
                      Maintenance Request Details
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <MaintenanceRequestDetails
                      request={selectedRequest}
                      onStatusUpdate={handleStatusUpdate}
                      onAssignClick={() => {
                        setSelectedOfficerId(selectedRequest.assigned_to_user_id || null);
                        setAssignDialogOpen(true);
                      }}
                      isOpsManager={isOpsManager}
                      isMaintenanceOfficer={isMaintenanceOfficer}
                    />
                  </ScrollArea>
                  <DrawerFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOpen(false)}
                      className="rounded-full"
                    >
                      Close
                    </Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            ) : (
              <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{selectedRequest.title}</SheetTitle>
                    <SheetDescription>
                      Maintenance Request Details
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <MaintenanceRequestDetails
                      request={selectedRequest}
                      onStatusUpdate={handleStatusUpdate}
                      onAssignClick={() => {
                        setSelectedOfficerId(selectedRequest.assigned_to_user_id || null);
                        setAssignDialogOpen(true);
                      }}
                      isOpsManager={isOpsManager}
                      isMaintenanceOfficer={isMaintenanceOfficer}
                    />
                  </ScrollArea>
                  <SheetFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOpen(false)}
                      className="rounded-full"
                    >
                      Close
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Assign Maintenance Officer</DialogTitle>
              <DialogDescription>
                Assign or reassign a maintenance officer to this request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Maintenance Officer</Label>
                <Select 
                  value={selectedOfficerId || "none"} 
                  onValueChange={(value) => setSelectedOfficerId(value === "none" ? null : value)}
                >
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Select officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassign</SelectItem>
                    {maintenanceOfficers?.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.first_name} {officer.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button onClick={handleAssign} className="rounded-full">
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

// Maintenance Request Details Component
const MaintenanceRequestDetails = ({
  request,
  onStatusUpdate,
  onAssignClick,
  isOpsManager,
  isMaintenanceOfficer,
}: {
  request: MaintenanceRequestWithRelations;
  onStatusUpdate: (status: string) => void;
  onAssignClick: () => void;
  isOpsManager: boolean;
  isMaintenanceOfficer: boolean;
}) => {
  const [completionNote, setCompletionNote] = useState<string>(request.completion_note || "");
  const [completedAt, setCompletedAt] = useState<string>(
    request.resolved_at ? format(parseISO(request.resolved_at), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [expectedResolveDate, setExpectedResolveDate] = useState<string>(
    request.sla_due_at
      ? format(parseISO(request.sla_due_at), "yyyy-MM-dd'T'HH:mm")
      : ""
  );
  const [expectedDialogOpen, setExpectedDialogOpen] = useState(false);
  const { toast } = useToast();
  const updateRequest = useUpdateMaintenanceRequest();

  const handleComplete = async () => {
    if (!completionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a completion note.",
      });
      return;
    }

    try {
      await updateRequest.mutateAsync({
        id: request.id,
        updates: {
          status: "completed_pending_approval",
          completion_note: completionNote,
          approval_status: "pending",
        },
      });

      toast({
        title: "Request completed",
        description: "The request has been marked as complete and is pending approval.",
      });

      onStatusUpdate("completed_pending_approval");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to complete request.",
      });
    }
  };

  const isOverdue = request.sla_due_at && 
    isBefore(parseISO(request.sla_due_at), new Date()) && 
    (request.status === "new" || request.status === "triaged" || request.status === "assigned" || request.status === "in_progress");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <div className="mt-1">{getStatusBadge(request.status || "new")}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Title</Label>
            <div className="mt-1 text-sm font-semibold">{request.title}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Studio</Label>
            <div className="mt-1 text-sm">
              {request.studio ? (
                <span className="font-medium">{request.studio.studio_number}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <div className="mt-1">
              {request.category ? (
                <Badge variant="outline" className="text-xs">
                  {request.category.replace("_", " ")}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Urgency</Label>
            <div className="mt-1">{getUrgencyBadge(request.urgency)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <div className="mt-1 text-sm">
              {request.assigned_to ? (
                <span>
                  {request.assigned_to.first_name} {request.assigned_to.last_name}
                </span>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">SLA Due</Label>
            <div className="mt-1 text-sm">
              {request.sla_due_at ? (
                <div>
                  <div>{format(parseISO(request.sla_due_at), "MMM d, yyyy 'at' h:mm a")}</div>
                  {isOverdue && (
                    <Badge variant="destructive" className="mt-1 text-xs">
                      Overdue
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Created</Label>
            <div className="mt-1 text-sm">
              {format(parseISO(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Expected Resolve Date</Label>
            <div className="mt-1 text-sm">
              {request.sla_due_at
                ? format(parseISO(request.sla_due_at), "MMM d, yyyy 'at' h:mm a")
                : <span className="text-muted-foreground">Not set</span>}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          <p className="text-sm mt-1 whitespace-pre-wrap">{request.description}</p>
        </div>

        {request.completion_note && (
          <div>
            <Label className="text-xs text-muted-foreground">Completion Note</Label>
            <p className="text-sm mt-1 whitespace-pre-wrap">{request.completion_note}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Actions - Role Based */}
      <div className="space-y-3">
        {(isOpsManager ||
          (isMaintenanceOfficer &&
            request.assigned_to_user_id &&
            request.status !== "resolved" &&
            request.status !== "cancelled")) && (
          <Button
            onClick={() => setExpectedDialogOpen(true)}
            variant="outline"
            className="rounded-full w-full"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Set Expected Resolve Date
          </Button>
        )}
        {isOpsManager && (
          <Button
            onClick={onAssignClick}
            variant="outline"
            className="rounded-full w-full"
          >
            <UserCheck className="h-4 w-4 mr-2" />
            {request.assigned_to_user_id ? "Reassign Officer" : "Assign Officer"}
          </Button>
        )}

        {isMaintenanceOfficer && 
         request.assigned_to_user_id && 
         (request.status === "assigned" || request.status === "in_progress") && (
          <>
            <Button
              onClick={() => onStatusUpdate("in_progress")}
              variant="outline"
              className="rounded-full w-full"
            >
              <Loader2 className="h-4 w-4 mr-2" />
              Mark In Progress
            </Button>
            <div className="space-y-2">
              <Label>Completion Note</Label>
              <Textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Describe what was done..."
                className="min-h-[100px] rounded-xl"
              />
              <Button
                onClick={handleComplete}
                className="rounded-full w-full"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Complete
              </Button>
            </div>
          </>
        )}

        {isOpsManager && request.status === "completed_pending_approval" && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={async () => {
                try {
                  await updateRequest.mutateAsync({
                    id: request.id,
                    updates: {
                      status: "resolved",
                      approval_status: "approved",
                      approved_at: new Date().toISOString(),
                      resolved_at: completedAt ? new Date(completedAt).toISOString() : new Date().toISOString(),
                    } as any,
                  });
                  toast({
                    title: "Request approved",
                    description: "The maintenance request has been approved and resolved.",
                  });
                  onStatusUpdate("resolved");
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: error.message || "Failed to approve request.",
                  });
                }
              }}
              className="rounded-full bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await updateRequest.mutateAsync({
                    id: request.id,
                    updates: {
                      status: "in_progress",
                      approval_status: "rejected",
                    } as any,
                  });
                  toast({
                    title: "Request sent for rework",
                    description: "The maintenance request has been sent back for rework.",
                  });
                  onStatusUpdate("rework_required");
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: error.message || "Failed to reject request.",
                  });
                }
              }}
              className="rounded-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </div>

      {/* Expected Resolve Date Dialog */}
      <Dialog open={expectedDialogOpen} onOpenChange={setExpectedDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Set Expected Resolve Date</DialogTitle>
            <DialogDescription>
              Choose when this maintenance request is expected to be resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Expected Resolve Date</Label>
              <Input
                type="datetime-local"
                value={expectedResolveDate}
                onChange={(e) => setExpectedResolveDate(e.target.value)}
                className="rounded-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExpectedDialogOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await updateRequest.mutateAsync({
                    id: request.id,
                    updates: {
                      sla_due_at: expectedResolveDate
                        ? new Date(expectedResolveDate).toISOString()
                        : null,
                    } as any,
                  });
                  toast({
                    title: "Expected date updated",
                    description: "The expected resolve date has been updated.",
                  });
                  setExpectedDialogOpen(false);
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: error.message || "Failed to update expected resolve date.",
                  });
                }
              }}
              className="rounded-full"
            >
              Set Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaintenanceJobManagementPage;

