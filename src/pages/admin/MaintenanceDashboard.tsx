import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useMaintenanceRequests, useUpdateMaintenanceRequest, type MaintenanceRequestWithRelations } from "@/hooks/useMaintenanceRequests";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useMaintenanceOfficers } from "@/hooks/useStaffMembers";
import { CreateMaintenanceTaskDialog } from "@/components/admin/CreateMaintenanceTaskDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isAfter, parseISO } from "date-fns";
import {
  Wrench,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Filter,
  Plus,
  Minus,
  AlertTriangle,
  UserCheck,
  UserX,
  FileCheck,
  Calendar,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceImagePreview } from "@/components/MaintenanceImagePreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getPriorityInfoFromUrgency } from "@/utils/maintenancePriority";

// Category filter options
const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "internet_wifi", label: "Internet/WiFi" },
  { value: "furniture", label: "Furniture" },
  { value: "appliance", label: "Appliance" },
  { value: "hvac", label: "HVAC" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "other", label: "Other" },
];

// Status filter options (includes both old and new statuses)
const STATUSES = [
  { value: "all", label: "All Status" },
  { value: "new", label: "New" },
  { value: "pending", label: "Pending" }, // Backward compatibility
  { value: "triaged", label: "Triaged" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed_pending_approval", label: "Pending Approval" },
  { value: "resolved", label: "Resolved" },
  { value: "rework_required", label: "Rework Required" },
  { value: "cancelled", label: "Cancelled" },
];

// Maintenance Image Component (reused from existing)
const MaintenanceImage = ({ 
  imagePath, 
  index, 
  onClick 
}: { 
  imagePath: string; 
  index: number;
  onClick: () => void;
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("maintenance-images")
          .createSignedUrl(imagePath, 3600);

        if (error) throw error;
        if (data?.signedUrl) {
          setImageUrl(data.signedUrl);
        }
      } catch (error) {
        console.error("Error fetching signed URL:", error);
        const { data } = supabase.storage
          .from("maintenance-images")
          .getPublicUrl(imagePath);
        setImageUrl(data.publicUrl);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [imagePath]);

  return (
    <button
      onClick={onClick}
      className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/60 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
    >
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={`Request image ${index + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
          Error
        </div>
      )}
    </button>
  );
};

// Status Badge Helper
const getStatusBadge = (status: string) => {
  const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
    new: { className: "bg-blue-500 hover:bg-blue-600 text-white", icon: Plus, label: "New" },
    pending: { className: "bg-yellow-500 hover:bg-yellow-600 text-white", icon: Clock, label: "Pending" },
    triaged: { className: "bg-purple-500 hover:bg-purple-600 text-white", icon: Filter, label: "Triaged" },
    assigned: { className: "bg-indigo-500 hover:bg-indigo-600 text-white", icon: UserCheck, label: "Assigned" },
    in_progress: { className: "bg-blue-500 hover:bg-blue-600 text-white", icon: Loader2, label: "In Progress" },
    completed_pending_approval: { className: "bg-orange-500 hover:bg-orange-600 text-white", icon: FileCheck, label: "Pending Approval" },
    resolved: { className: "bg-green-500 hover:bg-green-600 text-white", icon: CheckCircle2, label: "Resolved" },
    rework_required: { className: "bg-red-500 hover:bg-red-600 text-white", icon: AlertTriangle, label: "Rework Required" },
    cancelled: { className: "bg-gray-500 hover:bg-gray-600 text-white", icon: XCircle, label: "Cancelled" },
  };

  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

// Urgency / Priority Badge Helper
const getUrgencyBadge = (urgency: string) => {
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
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center`}>
      {label}
    </Badge>
  );
};

// Category Label Helper
const getCategoryLabel = (category: string | null) => {
  const labels: Record<string, string> = {
    plumbing: "Plumbing",
    electrical: "Electrical",
    internet_wifi: "Internet/WiFi",
    furniture: "Furniture",
    appliance: "Appliance",
    hvac: "HVAC",
    bathroom: "Bathroom",
    kitchen: "Kitchen",
    other: "Other",
  };
  return labels[category || "other"] || "Other";
};

const MaintenanceDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, profile, user } = useAuth();
  const isMobile = useIsMobile();
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Details drawer/sheet
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequestWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Image preview
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isMaintenanceOfficer = profile?.staff_subrole === "maintenance_officer";
  const isHousekeeper = profile?.staff_subrole === "housekeeper";
  // Staff who can create tasks: all roles except maintenance_officer and housekeeper
  const canCreateTasks = role === "staff" || role === "superadmin" || role === "admin" || role === "operations_manager" || role === "reservationist" || role === "accountant" || role === "front_desk";
  
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

  const { data: requests, isLoading } = useMaintenanceRequests(
    isMaintenanceOfficer && user?.id
      ? {
          assignedToUserId: user.id,
          includeUnassigned: true,
        }
      : undefined
  );
  const { data: activityLog } = useActivityLog(
    selectedRequest ? {
      entity_type: "maintenance_request",
      entity_id: selectedRequest.id,
      limit: 50,
    } : undefined
  );
  const { data: maintenanceOfficers } = useMaintenanceOfficers();
  const updateRequest = useUpdateMaintenanceRequest();

  // Filtered requests
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    let filtered = requests;

    // Status filter (handle both new and old statuses, plus special filters)
    if (statusFilter !== "all") {
      if (statusFilter === "new") {
        filtered = filtered.filter((r) => r.status === "new" || r.status === "pending");
      } else if (statusFilter === "unassigned") {
        filtered = filtered.filter((r) => 
          (r.status === "new" || r.status === "pending" || r.status === "triaged") && !r.assigned_to_user_id
        );
      } else if (statusFilter === "overdue") {
        const now = new Date();
        filtered = filtered.filter((r) => {
          if (!r.sla_due_at || r.status === "resolved" || r.status === "cancelled") return false;
          return isAfter(now, parseISO(r.sla_due_at));
        });
      } else {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
    }

    // Category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((r) => r.category === categoryFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.studio?.studio_number.toLowerCase().includes(query) ||
          r.communal_area?.name.toLowerCase().includes(query) ||
          r.communal_area?.location?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [requests, statusFilter, categoryFilter, searchQuery]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!requests) {
      return {
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
      new: requests.filter((r) => r.status === "new" || r.status === "pending").length,
      unassigned: requests.filter((r) => (r.status === "new" || r.status === "pending" || r.status === "triaged") && !r.assigned_to_user_id).length,
      assigned: requests.filter((r) => r.status === "assigned" || (r.assigned_to_user_id && r.status !== "resolved" && r.status !== "cancelled")).length,
      in_progress: requests.filter((r) => r.status === "in_progress").length,
      pending_approval: requests.filter((r) => r.status === "completed_pending_approval").length,
      overdue: requests.filter((r) => {
        if (!r.sla_due_at || r.status === "resolved" || r.status === "cancelled") return false;
        return isAfter(now, parseISO(r.sla_due_at));
      }).length,
    };
  }, [requests]);

  // Handle row click
  const handleRowClick = (request: MaintenanceRequestWithRelations) => {
    setSelectedRequest(request);
    setDetailsOpen(true);
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string, approvalStatus?: string) => {
    if (!selectedRequest) return;

    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === "completed_pending_approval") {
        updates.approval_status = "pending";
      } else if (newStatus === "resolved" && approvalStatus) {
        updates.approval_status = approvalStatus;
        updates.approved_by = profile?.id;
        updates.approved_at = new Date().toISOString();
      } else if (newStatus === "rework_required") {
        updates.approval_status = "rejected";
        updates.status = "in_progress";
      }

      await updateRequest.mutateAsync({
        id: selectedRequest.id,
        updates,
      });

      toast({
        title: "Request updated",
        description: "The maintenance request has been updated successfully.",
      });

      setDetailsOpen(false);
      setSelectedRequest(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update request.",
      });
    }
  };

  // Check if user is Ops Manager
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout pageTitle="Maintenance" subtitle="Manage maintenance requests and work orders">
        <div className="space-y-6">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-40 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
    <AdminLayout 
      pageTitle="Maintenance" 
      subtitle="Manage maintenance requests and work orders"
      mobileActionButton={
        canCreateTasks ? (
          <Button
            onClick={() => setCreateTaskDialogOpen(true)}
            size="sm"
            className="rounded-full h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Category Filter Cards - Horizontally Scrollable */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stats Cards - Click to Filter */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            onClick={() => setStatusFilter(statusFilter === "unassigned" ? "all" : "unassigned")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Unassigned</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{stats.unassigned}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "assigned" ? "all" : "assigned")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Assigned</div>
              <div className="text-xl md:text-2xl font-bold text-indigo-600">{stats.assigned}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">In Progress</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.in_progress}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "completed_pending_approval" ? "all" : "completed_pending_approval")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Pending Approval</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.pending_approval}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => {
              // Filter to show overdue
              if (statusFilter !== "overdue") {
                // We'll need to handle this specially in the filter logic
              }
            }}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Overdue</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.overdue}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full md:w-auto">
                <div>
                  <Input
                    placeholder="Search requests..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-full text-xs md:text-sm h-9 md:h-10"
                  />
                </div>
                <div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="rounded-full text-xs md:text-sm h-9 md:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value} className="text-xs md:text-sm">
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {canCreateTasks && (
                <div className="hidden md:flex">
                  <Button onClick={() => setCreateTaskDialogOpen(true)} className="rounded-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Maintenance Task
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              All Requests
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
                  {searchQuery || statusFilter !== "all" || categoryFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No maintenance requests have been submitted yet."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">Request ID</TableHead>
                        <TableHead className="text-xs md:text-sm">Location</TableHead>
                        <TableHead className="text-xs md:text-sm">Category</TableHead>
                        <TableHead className="text-xs md:text-sm">
                          Urgency / Priority
                        </TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Assigned To</TableHead>
                        <TableHead className="text-xs md:text-sm">Submitted</TableHead>
                        <TableHead className="text-xs md:text-sm">SLA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => {
                        const isOverdue = request.sla_due_at && isAfter(new Date(), parseISO(request.sla_due_at)) && 
                                          request.status !== "resolved" && request.status !== "cancelled";
                        return (
                          <TableRow
                            key={request.id}
                            className="hover:bg-accent/50 cursor-pointer"
                            onClick={() => handleRowClick(request)}
                          >
                            <TableCell className="font-mono text-xs">
                              {request.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              {request.studio ? (
                                <Badge variant="outline" className="rounded-full text-xs">
                                  Studio {request.studio.studio_number}
                                </Badge>
                              ) : request.communal_area ? (
                                <Badge variant="outline" className="rounded-full text-xs">
                                  {request.communal_area.name}
                                  {request.communal_area.location && ` - ${request.communal_area.location}`}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">N/A</span>
                              )}
                              {request.is_staff_created && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  Staff Created
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs">{getCategoryLabel(request.category)}</span>
                            </TableCell>
                            <TableCell>{getUrgencyBadge(request.urgency || "medium")}</TableCell>
                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                            <TableCell>
                              {request.assigned_to ? (
                                <span className="text-xs">
                                  {request.assigned_to.first_name} {request.assigned_to.last_name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(request.created_at), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge variant="destructive" className="rounded-full text-xs">
                                  Overdue
                                </Badge>
                              ) : request.sla_due_at ? (
                                <span className="text-xs text-muted-foreground">
                                  {format(parseISO(request.sla_due_at), "MMM d")}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {filteredRequests.map((request) => (
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
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {request.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(request.status)}
                            {getUrgencyBadge(request.urgency || "medium")}
                            {request.studio ? (
                              <Badge variant="outline" className="rounded-full text-xs">
                                Studio {request.studio.studio_number}
                              </Badge>
                            ) : request.communal_area ? (
                              <Badge variant="outline" className="rounded-full text-xs">
                                {request.communal_area.name}
                              </Badge>
                            ) : null}
                            {request.is_staff_created && (
                              <Badge variant="secondary" className="text-xs">
                                Staff
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(request.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
                      Request #{selectedRequest.id.slice(0, 8)}
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <RequestDetailsContent
                      request={selectedRequest}
                      activityLog={activityLog || []}
                      onStatusUpdate={handleStatusUpdate}
                      isOpsManager={isOpsManager}
                      isMaintenanceOfficer={isMaintenanceOfficer}
                      onImageClick={(images, index) => {
                        setPreviewImages(images);
                        setPreviewIndex(index);
                        setPreviewOpen(true);
                      }}
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
                      Request #{selectedRequest.id.slice(0, 8)}
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <RequestDetailsContent
                      request={selectedRequest}
                      activityLog={activityLog || []}
                      onStatusUpdate={handleStatusUpdate}
                      isOpsManager={isOpsManager}
                      isMaintenanceOfficer={isMaintenanceOfficer}
                      onImageClick={(images, index) => {
                        setPreviewImages(images);
                        setPreviewIndex(index);
                        setPreviewOpen(true);
                      }}
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

        {/* Image Preview Modal */}
        <MaintenanceImagePreview
          images={previewImages}
          initialIndex={previewIndex}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </div>

      {/* Create Maintenance Task Dialog */}
      <CreateMaintenanceTaskDialog
        open={createTaskDialogOpen}
        onOpenChange={setCreateTaskDialogOpen}
      />
    </AdminLayout>
  );
};

// Request Details Content Component
const RequestDetailsContent = ({
  request,
  activityLog,
  onStatusUpdate,
  isOpsManager,
  isMaintenanceOfficer,
  onImageClick,
}: {
  request: MaintenanceRequestWithRelations;
  activityLog: any[];
  onStatusUpdate: (status: string, approvalStatus?: string) => void;
  isOpsManager: boolean;
  isMaintenanceOfficer: boolean;
  onImageClick: (images: string[], index: number) => void;
}) => {
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateData, setUpdateData] = useState({
    status: request.status,
    assigned_to_user_id: request.assigned_to_user_id || "",
  });
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

  const { data: maintenanceOfficers } = useMaintenanceOfficers();
  const updateRequest = useUpdateMaintenanceRequest();
  const { toast } = useToast();

  const handleAssign = async () => {
    if (!updateData.assigned_to_user_id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a maintenance officer.",
      });
      return;
    }

    try {
      await updateRequest.mutateAsync({
        id: request.id,
        updates: {
          assigned_to_user_id: updateData.assigned_to_user_id,
          status: "assigned",
        },
      });

      toast({
        title: "Request assigned",
        description: "The maintenance request has been assigned successfully.",
      });

      setUpdateDialogOpen(false);
      onStatusUpdate("assigned");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign request.",
      });
    }
  };

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
        } as any,
      });

      toast({
        title: "Request completed",
        description: "The request has been marked as complete and is pending approval.",
      });

      onStatusUpdate("completed_pending_approval", "pending");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to complete request.",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          <p className="text-sm mt-1 whitespace-pre-wrap">{request.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="mt-1">{getStatusBadge(request.status)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Urgency</Label>
            <div className="mt-1">{getUrgencyBadge(request.urgency || "medium")}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <div className="mt-1 text-sm">{getCategoryLabel(request.category)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Location</Label>
            <div className="mt-1">
              {request.studio ? (
                <Badge variant="outline" className="rounded-full text-xs">
                  Studio {request.studio.studio_number}
                </Badge>
              ) : request.communal_area ? (
                <Badge variant="outline" className="rounded-full text-xs">
                  {request.communal_area.name}
                  {request.communal_area.location && ` - ${request.communal_area.location}`}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">N/A</span>
              )}
              {request.is_staff_created && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Staff Created
                </Badge>
              )}
            </div>
          </div>
          {request.created_by_profile && (
            <div>
              <Label className="text-xs text-muted-foreground">Created By</Label>
              <div className="mt-1 text-sm">
                {request.created_by_profile.first_name} {request.created_by_profile.last_name}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Expected Resolve Date</Label>
            <div className="mt-1 text-sm">
              {request.sla_due_at
                ? format(parseISO(request.sla_due_at), "MMM d, yyyy 'at' h:mm a")
                : <span className="text-muted-foreground">Not set</span>}
            </div>
          </div>
        </div>

        {request.assigned_to && (
          <div>
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <div className="mt-1 text-sm">
              {request.assigned_to.first_name} {request.assigned_to.last_name}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Images */}
      {request.images && request.images.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Images</Label>
          <div className="flex flex-wrap gap-2">
            {request.images.map((imagePath, idx) => (
              <MaintenanceImage
                key={idx}
                imagePath={imagePath}
                index={idx}
                onClick={() => onImageClick(request.images || [], idx)}
              />
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Activity Log / Timeline */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Activity Timeline</Label>
        <div className="space-y-3">
          {activityLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className="flex gap-3 text-xs">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                <div className="flex-1">
                  <p className="font-medium">{log.message}</p>
                  <p className="text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
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
                  onStatusUpdate("resolved", "approved");
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
                  onStatusUpdate("rework_required", "rejected");
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

        {isOpsManager && !request.assigned_to_user_id && request.status !== "resolved" && request.status !== "cancelled" && (
          <Button
            onClick={() => setUpdateDialogOpen(true)}
            variant="outline"
            className="rounded-full w-full"
          >
            <UserCheck className="h-4 w-4 mr-2" />
            Assign Officer
          </Button>
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

      {/* Assignment Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Assign Maintenance Officer</DialogTitle>
            <DialogDescription>
              Select a maintenance officer to assign this request to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Maintenance Officer</Label>
              <Select
                value={updateData.assigned_to_user_id}
                onValueChange={(value) => setUpdateData({ ...updateData, assigned_to_user_id: value })}
              >
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select officer..." />
                </SelectTrigger>
                <SelectContent>
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
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleAssign} className="rounded-full">
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaintenanceDashboard;

